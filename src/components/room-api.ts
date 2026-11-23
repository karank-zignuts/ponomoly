import type { RoomView } from "@/game/types";

export const ROOM_CODE = /^[A-Z2-9]{7}$/;
export const normalizeCode = (value: string) => value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 7);

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/rooms${path}`, {
    method: body === undefined ? "GET" : "POST", cache: "no-store", signal,
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok) throw new ApiError(result.error ?? "The room could not be reached.", response.status);
  return result as T;
}

export function errorText(error: unknown) {
  return error instanceof ApiError ? error.message : "Connection lost. Reconnect and try again.";
}

let session: Promise<unknown> | undefined;
export function ensureGuest() {
  session ??= api("").catch((error) => { session = undefined; throw error; });
  return session;
}

export type Recent = { code: string; name: string };
const RECENTS = "ponomoly-recent-rooms";
export function readRecents() {
  try { return localStorage.getItem(RECENTS) ?? "[]"; } catch { return "[]"; }
}
export function subscribeRecents(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(RECENTS, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(RECENTS, onChange);
  };
}
export function decodeRecents(raw: string): Recent[] {
  try {
    const rooms = JSON.parse(raw) as Recent[];
    return rooms.filter((room) => ROOM_CODE.test(room.code) && typeof room.name === "string");
  } catch { return []; }
}

export function saveRecent(view: RoomView) {
  const seat = view.seats.find((player) => player.id === view.me);
  if (!seat) return;
  try {
    localStorage.setItem(RECENTS, JSON.stringify([
      { code: view.code, name: seat.name },
      ...decodeRecents(readRecents()).filter((room) => room.code !== view.code),
    ].slice(0, 5)));
    window.dispatchEvent(new Event(RECENTS));
  } catch { /* Local storage is optional. */ }
}

export function forgetRecent(code: string) {
  try {
    localStorage.setItem(RECENTS, JSON.stringify(decodeRecents(readRecents()).filter((room) => room.code !== code)));
    window.dispatchEvent(new Event(RECENTS));
  } catch { /* Local storage is optional. */ }
}
