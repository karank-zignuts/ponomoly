import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Game } from "@/game/types";

export type Member = { id: string; hash: string; name: string; token: number; bot?: true };
export type RoomData = {
  host: string;
  members: Member[];
  game: Game | null;
  commands: Record<string, number>;
  botReadyAt?: number | null;
  botTradeRounds?: Record<string, number>;
};
export type RoomRow = {
  code: string;
  topic: string;
  created_by: string;
  revision: number;
  data: RoomData;
};

export interface RoomStore {
  read(code: string): Promise<RoomRow | null>;
  readCreation(key: string): Promise<RoomRow | null>;
  create(room: RoomRow): Promise<boolean>;
  update(room: RoomRow, expected: number): Promise<boolean>;
  markPresent(code: string, player: string): Promise<void>;
  online(code: string): Promise<Set<string>>;
}

export const PRESENCE_TIMEOUT_MS = 35_000;

type SQLiteRow = Omit<RoomRow, "data"> & { data: string };

class LocalStore implements RoomStore {
  private db: DatabaseSync;

  constructor(file: string) {
    mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      PRAGMA busy_timeout = 3000;
      CREATE TABLE IF NOT EXISTS rooms (
        code TEXT PRIMARY KEY, topic TEXT NOT NULL, created_by TEXT NOT NULL UNIQUE,
        revision INTEGER NOT NULL, data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS presence (
        code TEXT NOT NULL, player TEXT NOT NULL, seen INTEGER NOT NULL, PRIMARY KEY (code, player)
      );
    `);
  }

  private row(sql: string, key: string): RoomRow | null {
    const value = this.db.prepare(sql).get(key) as SQLiteRow | undefined;
    return value ? { ...value, data: JSON.parse(value.data) } : null;
  }

  async read(code: string) {
    return this.row("SELECT * FROM rooms WHERE code = ?", code);
  }

  async readCreation(key: string) {
    return this.row("SELECT * FROM rooms WHERE created_by = ?", key);
  }

  async create(room: RoomRow) {
    return this.db.prepare("INSERT OR IGNORE INTO rooms VALUES (?, ?, ?, ?, ?)")
      .run(room.code, room.topic, room.created_by, room.revision, JSON.stringify(room.data)).changes === 1;
  }

  async update(room: RoomRow, expected: number) {
    return this.db.prepare("UPDATE rooms SET revision = ?, data = ? WHERE code = ? AND revision = ?")
      .run(room.revision, JSON.stringify(room.data), room.code, expected).changes === 1;
  }

  async markPresent(code: string, player: string) {
    this.db.prepare("INSERT INTO presence VALUES (?, ?, ?) ON CONFLICT (code, player) DO UPDATE SET seen = excluded.seen")
      .run(code, player, Date.now());
  }

  async online(code: string) {
    const rows = this.db.prepare("SELECT player FROM presence WHERE code = ? AND seen >= ?")
      .all(code, Date.now() - PRESENCE_TIMEOUT_MS);
    return new Set(rows.map((row) => String(row.player)));
  }
}

class StorageResponseError extends Error {
  constructor(readonly status: number) { super(`Room storage returned HTTP ${status}.`); }
}

class SupabaseStore implements RoomStore {
  constructor(private url: string, private key: string) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("apikey", this.key);
    if (!this.key.startsWith("sb_secret_")) headers.set("Authorization", `Bearer ${this.key}`);
    headers.set("Content-Type", "application/json");
    const response = await fetch(`${this.url}/rest/v1/${path}`, {
      ...init, headers, cache: "no-store", signal: AbortSignal.timeout(6500),
    });
    if (!response.ok) throw new StorageResponseError(response.status);
    return (response.status === 204 || response.headers.get("content-length") === "0" ? null : await response.json()) as T;
  }

  async read(code: string) {
    return (await this.request<RoomRow[]>(`ponomoly_rooms?code=eq.${code}&limit=1`))[0] ?? null;
  }

  async readCreation(key: string) {
    return (await this.request<RoomRow[]>(`ponomoly_rooms?created_by=eq.${key}&limit=1`))[0] ?? null;
  }

  async create(room: RoomRow) {
    try {
      const rows = await this.request<RoomRow[]>("ponomoly_rooms", {
        method: "POST", headers: { Prefer: "return=representation" },
        body: JSON.stringify(room),
      });
      return rows.length === 1;
    } catch (error) {
      if (error instanceof StorageResponseError && error.status === 409) return false;
      throw error;
    }
  }

  async update(room: RoomRow, expected: number) {
    const rows = await this.request<{ code: string }[]>(`ponomoly_rooms?code=eq.${room.code}&revision=eq.${expected}&select=code`, {
      method: "PATCH", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ revision: room.revision, data: room.data }),
    });
    return rows.length === 1;
  }

  async markPresent(code: string, player: string) {
    await this.request("ponomoly_presence?on_conflict=code,player", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ code, player, seen: new Date().toISOString() }),
    });
  }

  async online(code: string) {
    const cutoff = encodeURIComponent(new Date(Date.now() - PRESENCE_TIMEOUT_MS).toISOString());
    const rows = await this.request<{ player: string }[]>(`ponomoly_presence?code=eq.${code}&seen=gte.${cutoff}&select=player`);
    return new Set(rows.map((row) => row.player));
  }
}

let store: RoomStore | undefined;

export function realtimeInfo(topic: string) {
  const { SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY } = process.env;
  return SUPABASE_URL && SUPABASE_SECRET_KEY && SUPABASE_PUBLISHABLE_KEY
    ? { topic, url: SUPABASE_URL, key: SUPABASE_PUBLISHABLE_KEY } : null;
}

export function getRoomStore(): RoomStore {
  if (store) return store;
  const { SUPABASE_URL, SUPABASE_SECRET_KEY, PONOMOLY_DB_PATH } = process.env;
  if (SUPABASE_URL && SUPABASE_SECRET_KEY) {
    return store = new SupabaseStore(SUPABASE_URL.replace(/\/$/, ""), SUPABASE_SECRET_KEY);
  }
  if (SUPABASE_URL || SUPABASE_SECRET_KEY || process.env.VERCEL) {
    throw new Error("Set both SUPABASE_URL and SUPABASE_SECRET_KEY to use shared room storage.");
  }
  return store = new LocalStore(resolve(PONOMOLY_DB_PATH ?? ".data/ponomoly.sqlite"));
}
