"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomAction, RoomView } from "@/game/types";
import { api, ApiError, ensureGuest, errorText, ROOM_CODE, saveRecent } from "./room-api";

type Pending = { revision: number; command: string; action: RoomAction };
type Status = "loading" | "join" | "ready" | "missing" | "unavailable";
export type Send = (action: RoomAction) => Promise<boolean>;

export function useRoom(code: string) {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [status, setStatus] = useState<Status>(ROOM_CODE.test(code) ? "loading" : "missing");
  const [connected, setConnected] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retryable, setRetryable] = useState(false);
  const current = useRef<RoomView | null>(null);
  const pending = useRef<Pending | null>(null);
  const operating = useRef(false);
  const reading = useRef(false);
  const lastPresence = useRef(0);
  const realtimeReady = useRef(false);
  const lastRead = useRef(0);
  const online = useRef(true);
  const stopped = useRef(false);
  const refreshNeeded = useRef(false);
  const path = `/${code}`;

  const ingest = useCallback((next: RoomView) => {
    const previous = current.current;
    if (previous && previous.revision > next.revision) return;
    current.current = next;
    setRoom(next);
    setStatus("ready");
    if (!previous) saveRecent(next);
  }, []);

  const refresh = useCallback(async function readRoom(force = false) {
    if (!ROOM_CODE.test(code) || stopped.current) return;
    if (reading.current) { if (force) refreshNeeded.current = true; return; }
    const now = Date.now();
    if (!force && document.hidden) return;
    const botDue = current.current?.botReadyAt;
    const targetInterval = botDue && now >= botDue ? 650 : realtimeReady.current ? 10_000 : 1400;
    if (!force && now - lastRead.current < targetInterval) return;
    reading.current = true;
    try {
      const present = force || now - lastPresence.current > 10_000;
      const result = await api<RoomView>(`${path}${present ? "?present=1" : ""}`, undefined, AbortSignal.timeout(8500));
      if (present) lastPresence.current = now;
      lastRead.current = now;
      ingest(result);
      setConnected(true);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 404)) {
        if (!current.current) setStatus(e.status === 401 ? "join" : "missing");
      } else {
        setConnected(false);
        if (!current.current) setStatus("unavailable");
      }
    } finally {
      reading.current = false;
      if (refreshNeeded.current && !stopped.current) {
        refreshNeeded.current = false;
        // Read again in case a notification arrived during the first read.
        setTimeout(() => void readRoom(true), 20);
      }
    }
  }, [code, ingest, path]);

  useEffect(() => {
    stopped.current = false;
    lastPresence.current = 0;
    const resume = () => {
      online.current = navigator.onLine;
      if (!online.current) setConnected(false);
      if (online.current && !document.hidden) void refresh(true);
    };
    resume();
    const timer = setInterval(() => {
      if (current.current && online.current) void refresh();
    }, 730);
    window.addEventListener("online", resume);
    window.addEventListener("offline", resume);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      stopped.current = true;
      clearInterval(timer);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", resume);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [refresh]);

  const realtime = room?.realtime;
  const realtimeUrl = realtime?.url;
  const realtimeKey = realtime?.key;
  const realtimeTopic = realtime?.topic;
  useEffect(() => {
    if (!realtimeUrl || !realtimeKey || !realtimeTopic) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void import("@supabase/supabase-js").then(({ createClient }) => {
      if (disposed) return;
      const client = createClient(realtimeUrl, realtimeKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const channel = client.channel(realtimeTopic)
        .on("broadcast", { event: "revision" }, ({ payload }) => {
          if (Number.isSafeInteger(payload.revision) && payload.revision > (current.current?.revision ?? 0)) void refresh(true);
        })
        .subscribe((state) => {
          if (disposed) return;
          realtimeReady.current = state === "SUBSCRIBED";
          if (realtimeReady.current) void refresh(true);
        });
      cleanup = () => { void client.removeChannel(channel); };
    }).catch(() => { realtimeReady.current = false; });
    return () => { disposed = true; realtimeReady.current = false; cleanup?.(); };
  }, [realtimeUrl, realtimeKey, realtimeTopic, refresh]);

  async function join(profile: { name: string; token: number }) {
    try {
      await ensureGuest();
      const result = await api<RoomView>(`${path}/join`, profile, AbortSignal.timeout(10_000));
      ingest(result);
      setConnected(true);
    } catch (e) { throw new Error(errorText(e)); }
  }

  async function perform(command: Pending) {
    if (operating.current || !online.current) return false;
    operating.current = true;
    pending.current = command;
    setBusy(true);
    setError("");
    setRetryable(false);
    try {
      const result = await api<RoomView | null>(`${path}/action`, command, AbortSignal.timeout(10_000));
      if (result) ingest(result);
      pending.current = null;
      return true;
    } catch (e) {
      setError(errorText(e));
      if (e instanceof ApiError && e.status < 500) pending.current = null;
      else setRetryable(true);
      void refresh(true);
      return false;
    } finally {
      operating.current = false;
      setBusy(false);
    }
  }

  const send: Send = async (action) => {
    if (!current.current) return false;
    return perform({ action, command: crypto.randomUUID(), revision: current.current.revision });
  };

  return {
    room, status, connected, busy, error, retryable, send, join,
    retry: () => { if (pending.current) void perform(pending.current); },
    refresh: () => void refresh(true),
  };
}
