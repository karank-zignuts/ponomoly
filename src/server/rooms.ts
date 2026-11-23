import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import { MAX_PLAYERS } from "@/game/board";
import { chooseBotAction, nextBot } from "@/game/bot";
import { applyAction, createGame, publicGame, RuleError } from "@/game/engine";
import type { RoomAction, RoomView } from "@/game/types";
import { getRoomStore, realtimeInfo, type Member, type RoomData, type RoomRow } from "./room-store";

const BOT_NAMES = ["Ira", "Rohan", "Nila", "Arjun", "Kavya", "Vikram"];
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export class RoomError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

type Profile = Pick<Member, "name" | "token">;

function scheduledBot(data: RoomData) {
  return data.game ? nextBot(data.game, new Set(data.members.filter((member) => member.bot).map((member) => member.id))) : null;
}

function scheduleBot(data: RoomData) {
  data.botReadyAt = scheduledBot(data) ? Date.now() + randomInt(550, 1050) : null;
}

export async function advanceDueBot(room: RoomRow): Promise<RoomRow> {
  const id = scheduledBot(room.data);
  if (!id || !room.data.game || (room.data.botReadyAt ?? 0) > Date.now()) return room;
  const store = getRoomStore();
  const next: RoomRow = { ...room, data: structuredClone(room.data), revision: room.revision + 1 };
  const game = room.data.game;
  const action = chooseBotAction(publicGame(game), id, game.round === room.data.botTradeRounds?.[id]);
  next.data.game = applyAction(game, id, action, randomInt);
  if (action.type === "offerTrade") next.data.botTradeRounds = { ...next.data.botTradeRounds, [id]: game.round };
  scheduleBot(next.data);
  return await store.update(next, room.revision) ? next : await getRoom(room.code);
}

export async function viewRoom(room: RoomRow, memberId: string, heartbeat = false): Promise<RoomView> {
  const store = getRoomStore();
  if (heartbeat) await store.markPresent(room.code, memberId);
  const online = await store.online(room.code);
  return {
    code: room.code, revision: room.revision, me: memberId, host: room.data.host,
    seats: room.data.members.map(({ id, name, token, bot }) => ({ id, name, token, bot, online: Boolean(bot) || id === memberId || online.has(id) })),
    game: room.data.game ? publicGame(room.data.game) : null,
    botReadyAt: room.data.botReadyAt ?? null, realtime: realtimeInfo(room.topic),
  };
}

export async function getRoom(code: string) {
  const room = await getRoomStore().read(code);
  if (!room) throw new RoomError("This room could not be found. Check the invite code.", 404);
  return room;
}

export function getMember(room: RoomRow, guest: string) {
  const member = room.data.members.find((seat) => seat.hash === hash(guest));
  if (!member) throw new RoomError("Join this room to take a seat.", 401);
  return member;
}

export async function createRoom(guest: string, profile: Profile, command: string) {
  const store = getRoomStore();
  const key = hash(guest + command);
  const created = await store.readCreation(key);
  if (created) return viewRoom(created, getMember(created, guest).id, true);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = Array.from({ length: 7 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");
    const member = { name: profile.name, token: profile.token, id: randomUUID(), hash: hash(guest) };
    const room: RoomRow = {
      code, topic: `ponomoly-${randomBytes(24).toString("hex")}`, created_by: key, revision: 1,
      data: { host: member.id, members: [member], game: null, commands: {} },
    };
    if (await store.create(room)) return viewRoom(room, member.id, true);
    const raced = await store.readCreation(key);
    if (raced) return viewRoom(raced, getMember(raced, guest).id, true);
  }
  throw new RoomError("Could not open a room. Try again.", 503);
}

export async function joinRoom(code: string, guest: string, profile: Profile) {
  const store = getRoomStore();
  const identity = hash(guest);
  for (let attempt = 0; attempt < MAX_PLAYERS; attempt++) {
    const room = await getRoom(code);
    const existing = room.data.members.find((member) => member.hash === identity);
    if (existing) return viewRoom(room, existing.id, true);
    if (room.data.game) throw new RoomError("This match has already started. Only seated players can rejoin.", 409);
    if (room.data.members.length >= MAX_PLAYERS) throw new RoomError("This room is full.", 409);
    const taken = new Set(room.data.members.map((member) => member.token));
    const token = taken.has(profile.token) ? [0, 1, 2, 3, 4, 5].find((candidate) => !taken.has(candidate))! : profile.token;
    const member = { ...profile, token, id: randomUUID(), hash: identity };
    const next = {
      ...room, revision: room.revision + 1,
      data: { ...room.data, host: room.data.host || member.id, members: [...room.data.members, member] },
    };
    if (await store.update(next, room.revision)) return viewRoom(next, member.id, true);
  }
  throw new RoomError("The room is busy. Try joining again.", 409);
}

export async function roomAction(code: string, guest: string, expected: number, command: string, action: RoomAction) {
  const store = getRoomStore();
  const room = await getRoom(code);
  // A lobby departure can be retried after its seat has been removed.
  const commandKey = hash(guest + command);
  if (action.type === "leaveLobby" && room.data.commands[commandKey]) {
    const member = room.data.members.find((seat) => seat.hash === hash(guest));
    if (!member) return null;
  }
  const player = getMember(room, guest);
  if (room.data.commands[commandKey]) return viewRoom(room, player.id);
  if (room.revision !== expected) throw new RoomError("The room has moved on. Check the updated board and try again.", 409);
  const next: RoomRow = { ...room, revision: room.revision + 1 };
  const data = next.data;
  if (action.type === "chooseToken" || action.type === "leaveLobby" || action.type === "start" || action.type === "addBot" || action.type === "removeBot") {
    if (data.game) throw new RoomError("The game has already started.", 409);
    if (action.type === "chooseToken") {
      if (data.members.some((member) => member.token === action.token && member.id !== player.id)) {
        throw new RoomError("That token is already taken. Choose another one.", 409);
      }
      player.token = action.token;
    } else if (action.type === "leaveLobby") {
      data.members = data.members.filter((member) => member.id !== player.id);
      if (data.host === player.id) data.host = data.members.find((seat) => !seat.bot)?.id ?? "";
      if (!data.host) data.members = [];
    } else if (action.type === "addBot" || action.type === "removeBot") {
      if (data.host !== player.id) throw new RoomError("Only the host can manage computer players.", 403);
      if (action.type === "addBot") {
        if (data.members.length >= MAX_PLAYERS) throw new RoomError("The room is full.", 409);
        const token = [0, 1, 2, 3, 4, 5].find((index) => !data.members.some((seat) => seat.token === index))!;
        const name = BOT_NAMES.find((candidate) => !data.members.some((seat) => seat.name === candidate)) ?? `Player ${token + 1}`;
        data.members.push({ id: randomUUID(), hash: "", name, token, bot: true });
      } else {
        if (!data.members.some((seat) => seat.id === action.player && seat.bot)) {
          throw new RoomError("This computer player has already left.", 409);
        }
        data.members = data.members.filter((seat) => seat.id !== action.player);
      }
    } else {
      if (data.host !== player.id) throw new RoomError("Only the host can start this match.", 403);
      if (data.members.length < 2) throw new RoomError("Invite at least one more player to start.", 409);
      data.game = createGame(data.members, randomInt);
    }
  } else {
    if (!data.game) throw new RoomError("The match has not started.", 409);
    try {
      data.game = applyAction(data.game, player.id, action, randomInt);
    } catch (error) {
      if (error instanceof RuleError) throw new RoomError(error.message, 422);
      throw error;
    }
  }
  scheduleBot(next.data);
  // Revision checks prevent older retries from applying even after a receipt ages out.
  data.commands = Object.fromEntries([...Object.entries(data.commands).slice(-255), [commandKey, next.revision]]);
  if (!await store.update(next, expected)) {
    const latest = await getRoom(code);
    if (latest.data.commands[commandKey]) return action.type === "leaveLobby" ? null : viewRoom(latest, player.id);
    throw new RoomError("Another player acted first. Check the updated board and try again.", 409);
  }
  return action.type === "leaveLobby" ? null : viewRoom(next, player.id, true);
}
