"use client";

import Link from "next/link";
import { ArrowDownToLine, BookOpen, Check, Compass, Link2, X } from "lucide-react";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { BID_INCREMENT, CITY_MARKETS, DEPARTURE_PAY, MIN_BID, RELEASE_FEE, rupees, STARTING_CASH } from "@/game/board";

type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };
let installPrompt: InstallEvent | null = null;
const installListeners = new Set<(prompt: InstallEvent | null) => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event as InstallEvent;
    installListeners.forEach((listener) => listener(installPrompt));
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    installListeners.forEach((listener) => listener(null));
  });
}

function subscribeInstall(onChange: () => void) {
  installListeners.add(onChange);
  return () => { installListeners.delete(onChange); };
}
function subscribeDisplay(onChange: () => void) {
  const media = window.matchMedia("(display-mode: standalone)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function Dialog({ title, children, onClose, wide = false }: {
  title: string; children: ReactNode; onClose: () => void; wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useId();
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return <dialog
    ref={ref} className={`dialog ${wide ? "dialog-wide" : ""}`} aria-labelledby={heading}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
  >
    <div className="dialog-inner">
      <div className="dialog-head">
        <h2 id={heading}>{title}</h2>
        <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20} /></button>
      </div>
      {children}
    </div>
  </dialog>;
}

export function RulesDialog({ onClose }: { onClose: () => void }) {
  return <Dialog title="How to play" onClose={onClose} wide>
    <div className="rules">
      <p>Start with {rupees(STARTING_CASH)}. Buy cities, railways, and utilities, and collect rent when other players land on them. The last player with money or assets wins.</p>
      <details open><summary>Roll and move</summary><p>Roll two dice and travel around the board. Collect {rupees(DEPARTURE_PAY)} each time you pass or reach Departure. Doubles give you another roll. Three doubles on one turn send you straight to Holding. Rest Stop is a free space.</p></details>
      <details><summary>Buy a property or send it to auction</summary><p>When you land on an unowned property, buy it at the listed price or send it to auction. All active players can bid, including the one who declined it. Bidding starts at {rupees(MIN_BID)} and increases by at least {rupees(BID_INCREMENT)}. Passing ends your participation in that auction.</p></details>
      <details><summary>Rent, colour sets, houses and hotels</summary><p>Rent is collected automatically. Undeveloped citys charge double their usual rent when the owner has the complete colour set. Rail rent grows with the number of railways owned. Utility rent uses the dice total. Mortgaged properties collect no rent.</p><p>Build evenly across an unmortgaged colour set. After four houses on each city, you can upgrade to a hotel by returning four houses to the bank. Buildings sell back at half their listed cost. The bank has 32 houses and 12 hotels. If multiple players can buy the last building, it goes to auction.</p></details>
      <details><summary>Cards and Holding</summary><p>Journey and City Post cards can move you, give or take money, or let you keep a Release Pass. In Holding, pay {rupees(RELEASE_FEE)}, use a pass, or try for doubles. On your third failed attempt, pay the fee and move with that roll. You can still collect rent, trade, and bid while in Holding.</p></details>
      <details><summary>Trades, mortgages and bankruptcy</summary><p>Trade cash, undeveloped deeds, and Release Passes with other players. Sell every building in a city before mortgaging or trading any city in that set. A mortgage raises half the printed price. Clearing it costs the principal plus 10%. When a mortgaged deed changes hands, the recipient can clear it or pay the interest and keep it mortgaged.</p><p>If you owe more cash than you have, you can sell buildings, mortgage deeds, or arrange a trade. If you still cannot cover the bill, declare bankruptcy. A player creditor receives your estate. The bank auctions deeds returned to it.</p></details>
      <details><summary>City prices</summary><p>Each deed represents a whole city. The eight colour sets follow National Housing Bank’s RESIDEX housing valuations through June 2026. Board amounts are scaled for play.</p>
        <ul className="price-guide">{CITY_MARKETS.map((city) => <li key={city.name}><span>{city.name}</span><b>{rupees(city.price)} in game</b></li>)}</ul>
        <a href="https://residex.nhbonline.org.in/" target="_blank" rel="noreferrer">NHB RESIDEX</a> · <a href="https://indiaindata.online/property-prices/" target="_blank" rel="noreferrer">Reference data compiled by India in Data</a>
      </details>
    </div>
  </Dialog>;
}

export function Header({ children }: { children?: ReactNode }) {
  const [help, setHelp] = useState<"rules" | "install" | null>(null);
  const installer = useSyncExternalStore(subscribeInstall, () => installPrompt, () => null);
  const standalone = useSyncExternalStore(subscribeDisplay, () => window.matchMedia("(display-mode: standalone)").matches, () => false);
  const [acceptedInstall, setAcceptedInstall] = useState(false);
  const [installMessage, setInstallMessage] = useState("");
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);
  async function install() {
    if (!installer) { setInstallMessage(""); setHelp("install"); return; }
    try {
      await installer.prompt();
      if ((await installer.userChoice).outcome === "accepted") setAcceptedInstall(true);
    } catch {
      setInstallMessage("Use your browser menu to install Ponomoly.");
      setHelp("install");
    } finally {
      installPrompt = null;
      installListeners.forEach((listener) => listener(null));
    }
  }
  return <>
    <a className="skip-link" href="#main">Skip to game</a>
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="logo" aria-label="Ponomoly home">
          <span className="logo-mark"><Compass aria-hidden="true" size={20} strokeWidth={1.8} /></span>
          <span>Ponomoly</span>
        </Link>
        {children}
        <div className="header-actions">
          <button type="button" className="header-button" onClick={() => setHelp("rules")}><BookOpen size={17} aria-hidden="true" /><span>How to play</span></button>
          {!standalone && !acceptedInstall && <button type="button" className="header-button" onClick={install}><ArrowDownToLine size={17} aria-hidden="true" /><span>Install</span></button>}
        </div>
      </div>
    </header>
    {help === "rules" && <RulesDialog onClose={() => setHelp(null)} />}
    {help === "install" && <Dialog title="Install Ponomoly" onClose={() => setHelp(null)}>
      {installMessage && <p className="notice">{installMessage}</p>}
      <p>On iPhone or iPad, open Ponomoly in Safari, tap Share, then choose <strong>Add to Home Screen</strong>.</p>
      <p>On Android or desktop, open the browser menu and choose <strong>Install app</strong> or <strong>Add to Home Screen</strong> when available.</p>
    </Dialog>}
  </>;
}

export function CopyInvite({ code, compact = false }: { code: string; compact?: boolean }) {
  const [state, setState] = useState<"ready" | "copied" | "manual">("ready");
  return <div className={compact ? "copy-compact" : "copy-wrap"}>
    <button type="button" className={compact ? "room-code" : "button button-secondary"} onClick={async () => {
      try {
        await navigator.clipboard.writeText(new URL(`/room/${code}`, window.location.origin).href);
        setState("copied");
      } catch { setState("manual"); }
    }} aria-label={compact ? `Copy room ${code} invite link` : undefined}>
      {state === "copied" ? <Check size={16} aria-hidden="true" /> : <Link2 size={16} aria-hidden="true" />}
      {compact ? code : state === "copied" ? "Link copied" : "Copy invite link"}
    </button>
    <span className="sr-only" aria-live="polite">{state === "copied" ? "Invite link copied" : state === "manual" ? "Copy this room’s address from your browser." : ""}</span>
    {!compact && state === "manual" && <p className="muted small">Copy this room’s address from your browser.</p>}
  </div>;
}

export function Loading({ children }: { children: ReactNode }) {
  return <div className="center-state" role="status"><span className="spinner" aria-hidden="true" />{children}</div>;
}
