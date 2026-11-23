"use client";

import { ArrowLeftRight } from "lucide-react";
import { useState } from "react";
import { BOARD, rupees } from "@/game/board";
import { canTradeDeed } from "@/game/economy";
import type { Deck } from "@/game/cards";
import type { Player, PublicGame, TradeSide } from "@/game/types";
import { Dialog } from "./shared";
import type { Send } from "./use-room";

const empty = (): TradeSide => ({ cash: 0, deeds: [], passes: [] });

function SideEditor({ label, game, player, side, update }: {
  label: string; game: PublicGame; player: Player; side: TradeSide; update: (side: TradeSide) => void;
}) {
  const deeds = Object.keys(game.deeds).map(Number).filter((tile) => canTradeDeed(game, player.id, tile));
  return <fieldset className="trade-side">
    <legend>{label}</legend>
    <label className="field"><span>Cash (₹)</span><input type="number" inputMode="numeric" min={0} max={player.cash}
      value={side.cash || ""} placeholder="0" onChange={(event) => update({ ...side, cash: Number(event.target.value) })} /></label>
    {(deeds.length > 0 || player.passes.length > 0) && <div className="trade-checks">
      {deeds.map((tile) => <label key={tile}><input type="checkbox" checked={side.deeds.includes(tile)} onChange={(event) => update({
        ...side, deeds: event.target.checked ? [...side.deeds, tile] : side.deeds.filter((item) => item !== tile),
      })} /><span>{BOARD[tile].name}{game.deeds[tile].mortgaged ? " · Mortgaged" : ""}</span></label>)}
      {player.passes.map((deck: Deck) => <label key={deck}><input type="checkbox" checked={side.passes.includes(deck)} onChange={(event) => update({
        ...side, passes: event.target.checked ? [...side.passes, deck] : side.passes.filter((item) => item !== deck),
      })} /><span>{deck === "dispatch" ? "Journey" : "City Post"} Release Pass</span></label>)}
    </div>}
  </fieldset>;
}

export function TradeDialog({ game, me, disabled, send, onClose }: {
  game: PublicGame; me: Player; disabled: boolean; send: Send; onClose: () => void;
}) {
  const others = game.players.filter((player) => player.id !== me.id && !player.bankrupt);
  const [target, setTarget] = useState(others[0]?.id ?? "");
  const [give, setGive] = useState(empty);
  const [want, setWant] = useState(empty);
  const [error, setError] = useState("");
  const recipient = others.find((player) => player.id === target);

  return <Dialog title="Offer a trade" onClose={onClose} wide>
    <form className="trade-form" onSubmit={async (event) => {
      event.preventDefault();
      if (!recipient) return;
      if (Object.values(give).every((value) => typeof value === "number" ? !value : !value.length) &&
          Object.values(want).every((value) => typeof value === "number" ? !value : !value.length)) {
        setError("Add cash, a property, or a pass to the trade."); return;
      }
      setError("");
      if (await send({ type: "offerTrade", to: recipient.id, give, want })) onClose();
      else setError("Your trade couldn’t be sent. Check that the items and cash are still available.");
    }}>
      <label className="field"><span>Trade with</span><select value={target} onChange={(event) => { setTarget(event.target.value); setWant(empty()); }} required>
        {others.map((player) => <option value={player.id} key={player.id}>{player.name}</option>)}
      </select></label>
      {recipient && <div className="trade-grid">
        <SideEditor label="You give" game={game} player={me} side={give} update={setGive} />
        <SideEditor label="You receive" game={game} player={recipient} side={want} update={setWant} />
      </div>}
      <p className="small muted">Receiving a mortgaged deed comes with an immediate interest payment.</p>
      {error && <p role="alert" className="error-message">{error}</p>}
      <button type="submit" className="button button-primary full" disabled={disabled || !recipient}>Send trade offer</button>
    </form>
  </Dialog>;
}

function describe(side: TradeSide) {
  return [side.cash ? rupees(side.cash) : "", ...side.deeds.map((tile) => BOARD[tile].name),
    ...side.passes.map((deck) => `${deck === "dispatch" ? "Journey" : "City Post"} Release Pass`)].filter(Boolean).join(", ") || "Nothing";
}

export function TradeNotice({ game, me, disabled, send }: {
  game: PublicGame; me: Player; disabled: boolean; send: Send;
}) {
  const trade = game.trade;
  if (!trade || (trade.from !== me.id && trade.to !== me.id)) return null;
  const incoming = trade.to === me.id;
  const player = game.players.find((item) => item.id === (incoming ? trade.from : trade.to));
  return <section className="panel trade-notice">
    <div className="panel-heading"><h2><ArrowLeftRight size={19} /> {incoming ? "Trade offer" : "Trade sent"}</h2></div>
    <p>{incoming ? `From ${player?.name}` : `To ${player?.name}`}</p>
    <dl><div><dt>You give</dt><dd>{describe(incoming ? trade.want : trade.give)}</dd></div>
      <div><dt>You get</dt><dd>{describe(incoming ? trade.give : trade.want)}</dd></div></dl>
    <div className="button-row">
      {incoming && <button type="button" className="button button-primary" disabled={disabled || game.phase === "auction"}
        onClick={() => void send({ type: "acceptTrade", tradeId: trade.id })}>Accept</button>}
      <button type="button" className="button button-secondary" disabled={disabled}
        onClick={() => void send({ type: incoming ? "declineTrade" : "cancelTrade", tradeId: trade.id })}>{incoming ? "Decline" : "Withdraw"}</button>
    </div>
    {incoming && game.phase === "auction" && <p className="small muted">The table has to finish the current decision before you can accept.</p>}
  </section>;
}
