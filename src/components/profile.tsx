"use client";

import { useId, useState } from "react";
import { TOKENS } from "@/game/board";
import { Token } from "./icons";

export function TokenPicker({ selected, onChange, taken = [], disabled = false }: {
  selected: number; onChange: (index: number) => void; taken?: number[]; disabled?: boolean;
}) {
  const name = useId();
  return <fieldset className="token-picker">
    <legend>Choose your token</legend>
    <div className="token-options">
      {TOKENS.map((token, index) => <label key={token.name} className="token-option">
        <input type="radio" name={name} checked={index === selected} onChange={() => onChange(index)} disabled={disabled || taken.includes(index)} />
        <Token index={index} />
        <span>{token.name}</span>
      </label>)}
    </div>
  </fieldset>;
}

export function ProfileForm({ label, busyLabel, onSubmit }: {
  label: string; busyLabel: string; onSubmit: (profile: { name: string; token: number }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [token, setToken] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <form className="profile-form" onSubmit={async (event) => {
    event.preventDefault();
    if (busy) return;
    const trimmed = name.trim();
    if (trimmed.length < 2) { setError("Enter at least two characters for your name."); return; }
    setBusy(true);
    setError("");
    try {
      await onSubmit({ name: trimmed, token });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }}>
    <label className="field">
      <span>Player name</span>
      <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="nickname" required minLength={2} maxLength={22} placeholder="e.g. Asha" />
    </label>
    <TokenPicker selected={token} onChange={setToken} disabled={busy} />
    {error && <p role="alert" className="error-message">{error}</p>}
    <button className="button button-primary" disabled={busy}>{busy ? busyLabel : label}</button>
  </form>;
}
