import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { advanceDueBot, createRoom, getRoom, getMember, joinRoom, roomAction, RoomError, viewRoom } from "@/server/rooms";
import { actionSchema, profileSchema } from "@/server/rules-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE = "ponomoly_guest";
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const ROOM_PATTERN = /^[A-Z2-9]{7}$/;
const cookieLifetime = 60 * 60 * 24 * 365;
const requestSchema = z.object({ revision: z.number().int().min(1), command: z.uuid(), action: actionSchema });
const createSchema = profileSchema.extend({ command: z.uuid() });

type Context = { params: Promise<{ room?: string[] }> };

function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
}

function errorResponse(error: unknown) {
  if (error instanceof RoomError) return json({ error: error.message }, error.status);
  console.error("Ponomoly request failed:", error instanceof Error ? error.message : "Unknown error");
  return json({ error: "The room server is temporarily unavailable. Try again in a moment." }, 503);
}

function guest(request: NextRequest) {
  const value = request.cookies.get(COOKIE)?.value;
  return value && TOKEN_PATTERN.test(value) ? value : null;
}

function path(parts: string[] | undefined) {
  const [code, action, ...extra] = parts ?? [];
  if (extra.length || (code && !ROOM_PATTERN.test(code))) throw new RoomError("This room code is invalid.", 404);
  return { code, action };
}

async function readBody(request: NextRequest) {
  // Room actions are small and only accepted from this app's origin.
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw new RoomError("This request must come from Ponomoly.", 403);
  if (origin && origin !== request.nextUrl.origin && site !== "same-origin") throw new RoomError("This request must come from Ponomoly.", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new RoomError("Send a JSON game action.", 415);
  const reader = request.body?.getReader();
  const decoder = new TextDecoder();
  let body = "";
  let length = 0;
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 8192) {
      await reader.cancel();
      throw new RoomError("That action is too large.", 413);
    }
    body += decoder.decode(value, { stream: true });
  }
  try {
    return JSON.parse(body + decoder.decode()) as unknown;
  } catch {
    throw new RoomError("That action could not be read.", 400);
  }
}

export async function GET(request: NextRequest, context: Context) {
  try {
    const { code, action } = path((await context.params).room);
    if (action) throw new RoomError("This route does not exist.", 404);
    const identity = guest(request);
    if (!code) {
      const response = json({ ready: true });
      if (!identity) response.cookies.set(COOKIE, randomBytes(32).toString("hex"), {
        maxAge: cookieLifetime, httpOnly: true, path: "/", sameSite: "lax",
        secure: request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https",
      });
      return response;
    }
    const room = await getRoom(code);
    if (!identity) throw new RoomError("Join this room to take a seat.", 401);
    const member = getMember(room, identity);
    return json(await viewRoom(await advanceDueBot(room), member.id, request.nextUrl.searchParams.get("present") === "1"));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const { code, action } = path((await context.params).room);
    const identity = guest(request);
    if (!identity) throw new RoomError("Refresh the page to start your guest session.", 401);
    const body = await readBody(request);
    if (!code) {
      const result = createSchema.safeParse(body);
      if (!result.success) throw new RoomError("Enter a valid player name and choose a token.", 400);
      return json(await createRoom(identity, result.data, result.data.command), 201);
    }
    if (action === "join") {
      const result = profileSchema.safeParse(body);
      if (!result.success) throw new RoomError("Enter a valid player name and choose a token.", 400);
      return json(await joinRoom(code, identity, result.data));
    }
    if (action === "action") {
      const result = requestSchema.safeParse(body);
      if (!result.success) throw new RoomError("This move is invalid.", 400);
      const { revision, command, action: move } = result.data;
      return json(await roomAction(code, identity, revision, command, move));
    }
    throw new RoomError("This route does not exist.", 404);
  } catch (error) {
    return errorResponse(error);
  }
}
