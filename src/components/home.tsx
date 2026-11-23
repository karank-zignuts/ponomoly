"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Compass, Globe2, UsersRound } from "lucide-react";
import { useRef, useState, useSyncExternalStore } from "react";
import { BOARD, MARKET_TIERS } from "@/game/board";
import type { RoomView } from "@/game/types";
import { Header } from "./shared";
import { ProfileForm } from "./profile";
import { api, ensureGuest, errorText, normalizeCode, decodeRecents, readRecents, ROOM_CODE, saveRecent, subscribeRecents } from "./room-api";

export function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const recent = decodeRecents(useSyncExternalStore(subscribeRecents, readRecents, () => "[]"));
  const command = useRef<string | null>(null);
  return <>
    <Header />
    <main id="main" className="home container">
      <div className="home-grid">
        <section className="home-content" aria-labelledby="home-title">
          <div className="edition-label"><Compass size={16} aria-hidden="true" /> INDIA EDITION</div>
          <h1 id="home-title">A game of<br />great Indian cities.</h1>
          <p className="home-intro">Buy cities, complete colour sets, and try to outlast your friends on a board that spans India.</p>
          <div className="entry">
            <div className="segmented" aria-label="Room options">
              <button type="button" aria-pressed={mode === "create"} onClick={() => setMode("create")}>Create a room</button>
              <button type="button" aria-pressed={mode === "join"} onClick={() => setMode("join")}>Join with a code</button>
            </div>
            {mode === "create" ? <ProfileForm label="Create private room" busyLabel="Opening room…" onSubmit={async (profile) => {
              try {
                await ensureGuest();
                command.current ??= crypto.randomUUID();
                const room = await api<RoomView>("", { ...profile, command: command.current });
                saveRecent(room);
                router.push(`/room/${room.code}`);
              } catch (e) { throw new Error(errorText(e)); }
            }} /> : <form className="profile-form" onSubmit={(event) => {
              event.preventDefault();
              if (!ROOM_CODE.test(code)) { setError("Enter the seven-character room code."); return; }
              router.push(`/room/${code}`);
            }}>
              <label className="field"><span>Room code</span><input className="code-input" value={code} onChange={(event) => { setCode(normalizeCode(event.target.value)); setError(""); }} placeholder="E.g. B6K9Q2M" spellCheck={false} autoCapitalize="characters" autoComplete="off" /></label>
              {error && <p className="error-message" role="alert">{error}</p>}
              <button className="button button-primary">Find room</button>
            </form>}
          </div>
          {recent.length > 0 && <div className="recent">
            <span className="small muted">Recent rooms</span>
            {recent.slice(0, 3).map((room) => <Link href={`/room/${room.code}`} key={room.code}>{room.code}<ArrowRight aria-hidden="true" size={14} /></Link>)}
          </div>}
        </section>
        <figure className="cover" aria-label="Illustrated landscape inspired by Indian cities">
          <div className="cover-top">
            <span><Globe2 size={16} aria-hidden="true" /> 22 Indian cities</span>
            <span><UsersRound size={16} aria-hidden="true" /> 2–6 players</span>
          </div>
          <figcaption>
            {[13, 18, 24, 26, 28, 31, 34, 39].map((tile) => {
              const city = BOARD[tile];
              return city.type === "city" && <span key={city.name}><i style={{ background: MARKET_TIERS[city.tier].color }} />{city.name}</span>;
            })}
          </figcaption>
        </figure>
      </div>
    </main>
  </>;
}
