"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Bot, CircleHelp, UsersRound, WifiOff, X } from "lucide-react";
import { useState } from "react";
import { MAX_PLAYERS } from "@/game/board";
import type { RoomView } from "@/game/types";
import { Board } from "./board";
import { GameRoom } from "./game-room";
import { Token } from "./icons";
import { ProfileForm, TokenPicker } from "./profile";
import { forgetRecent } from "./room-api";
import { CopyInvite, Dialog, Header, Loading } from "./shared";
import { useRoom, type Send } from "./use-room";

function Lobby({ room, disabled, send }: { room: RoomView; disabled: boolean; send: Send }) {
  const router = useRouter();
  const me = room.seats.find((seat) => seat.id === room.me)!;
  const host = room.host === me.id;
  const [leaving, setLeaving] = useState(false);
  return <div className="table-layout">
    <Board revision={room.revision} />
    <aside className="game-rail lobby-rail">
      <section className="panel lobby-intro">
        <span className="section-label"><UsersRound size={16} /> Private room</span>
        <h1>Meet at the table.</h1>
        <p>Invite friends or add computer players. Start once at least two seats are filled.</p>
        <div className="invite-line">
          <div><div className="small muted">Room code</div><strong>{room.code}</strong></div>
          <CopyInvite code={room.code} />
        </div>
      </section>
      <section className="panel players-panel">
        <div className="panel-heading"><h2>Players</h2><span className="pill">{room.seats.length} / {MAX_PLAYERS}</span></div>
        <ul className="player-list">
          {room.seats.map((seat) => <li key={seat.id} className={seat.id === room.me ? "player-row is-current" : "player-row"}>
            <Token index={seat.token} />
            <div className="player-id"><strong>{seat.name}{seat.id === me.id && <span className="small muted"> · You</span>}</strong>
              <span className="small muted">{seat.bot ? "Computer" : seat.id === room.host ? "Host" : seat.online ? "Ready" : "Disconnected"}</span></div>
            {seat.bot
              ? host && <button type="button" className="icon-button remove-bot" disabled={disabled} aria-label={`Remove computer player ${seat.name}`} onClick={() => void send({ type: "removeBot", player: seat.id })}><X size={16} /></button>
              : <span className={`status-dot${seat.online ? "" : " is-offline"}`} aria-label={seat.online ? "Connected" : "Disconnected"} />}
          </li>)}
        </ul>
        <TokenPicker selected={me.token} onChange={(token) => void send({ type: "chooseToken", token })}
          disabled={disabled} taken={room.seats.filter((seat) => seat.id !== me.id).map((seat) => seat.token)} />
        {host
          ? <div className="button-row lobby-actions">
            <button className="button button-secondary" type="button" disabled={disabled || room.seats.length >= MAX_PLAYERS} onClick={() => void send({ type: "addBot" })}><Bot size={17} /> Add bot</button>
            <button className="button button-primary" type="button" disabled={disabled || room.seats.length < 2} onClick={() => void send({ type: "start" })}>Start game <ArrowUpRight size={18} /></button>
          </div>
          : <p className="waiting-line">Waiting for {room.seats.find((seat) => seat.id === room.host)?.name ?? "the host"} to start.</p>}
      </section>
      <button type="button" className="text-button muted" disabled={disabled} onClick={() => setLeaving(true)}><ArrowLeft size={16} /> Leave lobby</button>
    </aside>
    {leaving && <Dialog title="Leave this lobby?" onClose={() => setLeaving(false)}>
      <p>Your seat will open up for someone else.</p>
      <div className="button-row">
        <button type="button" className="button button-secondary" onClick={() => setLeaving(false)}>Stay</button>
        <button type="button" className="button button-danger" disabled={disabled} onClick={async () => {
          if (await send({ type: "leaveLobby" })) {
            forgetRecent(room.code);
            router.push("/");
          } else setLeaving(false);
        }}>Leave lobby</button>
      </div>
    </Dialog>}
  </div>;
}

export function Room({ code }: { code: string }) {
  const sync = useRoom(code);
  const { room, status, connected, error, busy, send } = sync;
  const [dismissed, setDismissed] = useState("");
  return <>
    <Header>
      {room && <div className="room-toolbar">
        <CopyInvite code={code} compact />
        <span className="connection" role="status"><i className={`status-dot${connected ? "" : " is-offline"}`} />{connected ? "Connected" : "Reconnecting"}</span>
      </div>}
    </Header>
    <main id="main" className="container room-main">
      {status === "loading" && <Loading>Finding your room…</Loading>}
      {(status === "missing" || status === "unavailable") && <div className="center-state entry-state">
        {status === "missing" ? <CircleHelp size={32} /> : <WifiOff size={32} />}
        <h1>{status === "missing" ? "Room not found" : "Can’t reach the room"}</h1>
        <p>{status === "missing" ? "Check the seven-character code or ask the host for a fresh link." : "Check your connection and try opening the room again."}</p>
        <div className="button-row">
          <Link className="button button-secondary" href="/"><ArrowLeft size={16} /> Back home</Link>
          {status === "unavailable" && <button type="button" className="button button-primary" onClick={sync.refresh}>Try again</button>}
        </div>
      </div>}
      {status === "join" && <div className="join-grid">
        <section className="panel join-panel">
          <span className="section-label"><UsersRound size={17} /> Room {code}</span>
          <h1>Take a seat.</h1>
          <p>Choose your name and token to join your friends.</p>
          <ProfileForm label="Join room" busyLabel="Joining room…" onSubmit={sync.join} />
          <Link href="/" className="text-button"><ArrowLeft size={16} /> Back home</Link>
        </section>
        <div className="join-art" aria-hidden="true" />
      </div>}
      {room && !connected && <div className="reconnect-banner" role="status"><WifiOff size={18} />
        <span>Reconnecting. Your seat and confirmed moves are saved.</span>
        <button type="button" className="text-button" onClick={sync.refresh}>Retry now</button></div>}
      {room && error && (error !== dismissed || sync.retryable) && <div className="game-error" role="alert">
        <span>{error}</span>
        {sync.retryable
          ? <button type="button" className="text-button" disabled={!connected || busy} onClick={sync.retry}>Retry move</button>
          : <button type="button" className="text-button" onClick={() => setDismissed(error)}>Dismiss</button>}
      </div>}
      {room && (room.game ? <GameRoom room={room} game={room.game} disabled={busy || !connected} send={send} />
        : <Lobby room={room} disabled={busy || !connected} send={send} />)}
    </main>
  </>;
}
