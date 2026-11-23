"use client";

import { ArrowLeftRight, Building2, ChevronRight, Clock3, LockKeyhole, ScrollText } from "lucide-react";
import { useRef, useState } from "react";
import { BOARD, MARKET_TIERS, isDeed, rupees } from "@/game/board";
import { bankStock, investmentAllowed, ownsTier } from "@/game/economy";
import type { PublicGame, RoomView } from "@/game/types";
import { Board } from "./board";
import { SpaceIcon, Token } from "./icons";
import { BrowseDialog, PropertyDialog } from "./property-dialog";
import { TradeDialog, TradeNotice } from "./trades";
import { TurnPanel } from "./turn-panel";
import type { Send } from "./use-room";

type OpenDialog = { type: "property"; tile: number } | { type: "browse" | "trade" };

export function GameRoom({ room, game, disabled, send }: { room: RoomView; game: PublicGame; disabled: boolean; send: Send }) {
  const [view, setView] = useState<"activity" | "properties">("activity");
  const [all, setAll] = useState(false);
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const assets = useRef<HTMLButtonElement>(null);
  const me = game.players.find((player) => player.id === room.me)!;
  const activePlayer = game.players[game.turn];
  const mine = Object.keys(game.deeds).map(Number).filter((tile) => game.deeds[tile].owner === me.id);
  const tiles = all ? BOARD.flatMap((space, tile) => isDeed(space) ? [tile] : []) : mine;
  const stock = bankStock(game);
  const canTrade = !me.bankrupt && investmentAllowed(game, me.id) && (!game.trade || game.trade.from === me.id);
  const select = (tile: number) => setDialog({ type: "property", tile });
  const close = () => setDialog(null);

  return <div className="table-layout">
    <Board revision={room.revision} game={game} onSelect={select} onBrowse={() => setDialog({ type: "browse" })} />
    <aside className="game-rail" aria-label="Match controls">
      <TurnPanel room={room} game={game} disabled={disabled} send={send} onSelect={select} onManage={() => {
        setView("properties"); setAll(false);
        assets.current?.focus({ preventScroll: true });
        assets.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
      }} />
      <TradeNotice game={game} me={me} disabled={disabled} send={send} />
      <section className="panel players-panel">
        <div className="panel-heading"><h2>Players</h2><span className="pill">{game.players.filter((player) => !player.bankrupt).length} in play</span></div>
        <ul className="player-list">
          {game.players.map((player) => {
            const seat = room.seats.find((candidate) => candidate.id === player.id);
            const rows = Object.values(game.deeds).filter((deed) => deed.owner === player.id).length;
            return <li className={`player-row${player.id === activePlayer.id && game.phase !== "finished" ? " is-current" : ""}${player.bankrupt ? " is-eliminated" : ""}`} key={player.id}>
              <Token index={player.token} />
              <div className="player-id">
                <strong>{player.name}{player.id === me.id && <span className="small muted"> · You</span>}</strong>
                <span className="small muted">{player.bankrupt ? "Bankrupt" : [
                  `${rows} ${rows === 1 ? "deed" : "deeds"}`,
                  player.jail !== null ? "Holding" : null, seat?.bot ? "Computer" : !seat?.online ? "Disconnected" : null,
                ].filter(Boolean).join(" · ")}</span>
              </div>
              <strong className="balance">{rupees(player.cash)}</strong>
            </li>;
          })}
        </ul>
      </section>
      <section className="panel table-info">
        <div className="segmented" aria-label="Match information">
          <button type="button" aria-pressed={view === "activity"} onClick={() => setView("activity")}><Clock3 size={16} /> Activity</button>
          <button type="button" ref={assets} aria-pressed={view === "properties"} onClick={() => setView("properties")}><Building2 size={16} /> Properties</button>
        </div>
        {view === "activity" ? <ol className="activity-list" role="list" aria-label="Recent moves">
          {[...game.activity].reverse().map((event) => <li key={event.id} className={`activity-${event.kind}`}>
            <span className="activity-icon"><ScrollText size={15} aria-hidden="true" /></span><span>{event.text}</span>
          </li>)}
        </ol> : <>
          <div className="asset-head"><div className="mini-toggle">
            <button type="button" aria-pressed={!all} onClick={() => setAll(false)}>Mine</button>
            <button type="button" aria-pressed={all} onClick={() => setAll(true)}>All deeds</button>
          </div><span className="small muted">Bank · {stock.houses} houses / {stock.hotels} hotels</span></div>
          <ul className="asset-list">
            {tiles.map((tile) => {
              const space = BOARD[tile];
              const deed = game.deeds[tile];
              const owner = game.players.find((player) => player.id === deed?.owner);
              if (!isDeed(space)) return null;
              const city = space.type === "city" ? MARKET_TIERS[space.tier] : null;
              return <li key={tile}><button className="asset-row" type="button" onClick={() => select(tile)}>
                <span className="list-space-icon" style={city ? { color: city.color } : undefined}><SpaceIcon space={space} size={17} /></span>
                <span><strong>{space.name}</strong><small>{(city ? `${city.name} set` : null) ?? (space.type === "rail" ? "Railway" : "Utility")}{city && space.type === "city" && owner && ownsTier(game, space.tier, owner.id) ? " · Full set" : ""}</small></span>
                {deed?.mortgaged ? <LockKeyhole aria-label="Mortgaged" size={15} /> : owner ? <Token index={owner.token} /> : <b>{rupees(space.price)}</b>}
                <ChevronRight size={15} aria-hidden="true" />
              </button></li>;
            })}
          </ul>
          {!all && !mine.length && <p className="empty-assets">Your deeds will appear here after you buy a property.</p>}
          {me.passes.length > 0 && <p className="small notice">{me.passes.length} Release {me.passes.length === 1 ? "Pass" : "Passes"}</p>}
          {canTrade && <button type="button" className="button button-secondary full" onClick={() => setDialog({ type: "trade" })} disabled={disabled}>
            <ArrowLeftRight size={16} /> Offer a trade
          </button>}
        </>}
      </section>
      {view === "activity" && canTrade && <button type="button" className="text-button trade-shortcut" onClick={() => setDialog({ type: "trade" })} disabled={disabled}><ArrowLeftRight size={16} /> Offer a trade</button>}
    </aside>
    {dialog?.type === "browse" && <BrowseDialog onClose={close} onSelect={select} />}
    {dialog?.type === "property" && <PropertyDialog key={dialog.tile} tile={dialog.tile} game={game} me={me} disabled={disabled} send={send} onClose={close} />}
    {dialog?.type === "trade" && <TradeDialog game={game} me={me} disabled={disabled} send={send} onClose={close} />}
  </div>;
}
