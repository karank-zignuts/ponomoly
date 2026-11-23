"use client";

import {
  ArrowRight, Banknote, Building2, CirclePause, Dice5, Gavel, LockKeyhole,
  MailOpen, Ticket, Trophy,
} from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { BOARD, MARKET_TIERS, isDeed, MIN_BID, mortgageInterest, mortgageValue, RELEASE_FEE, rupees } from "@/game/board";
import { CARDS } from "@/game/cards";
import { buildProblem, minimumBid, wealthIfLiquidated } from "@/game/economy";
import type { Player, PublicGame, RoomView } from "@/game/types";
import { SpaceIcon } from "./icons";
import { Dialog } from "./shared";
import type { Send } from "./use-room";

const PIPS = [[], [4], [0, 8], [0, 4, 8], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8]];
function Dice({ values }: { values: [number, number] | null }) {
  if (!values) return <Dice5 className="turn-symbol" size={35} aria-hidden="true" />;
  return <div className="dice" role="img" aria-label={`Dice rolled ${values[0]} and ${values[1]}`}>
    {values.map((value, index) => <span className="die" key={index}>{Array.from({ length: 9 }, (_, pip) =>
      <i key={pip} className={PIPS[value].includes(pip) ? "pip" : ""} />)}</span>)}
  </div>;
}

function AuctionBid({ game, me, disabled, send }: { game: PublicGame; me: Player; disabled: boolean; send: Send }) {
  const auction = game.auction!;
  const minimum = minimumBid(auction);
  const [amount, setAmount] = useState(String(minimum));
  const building = auction.item.kind === "building" ? auction.item.level : null;
  const options = building ? Object.keys(game.deeds).map(Number).filter((index) =>
    (game.deeds[index].level === 4 ? "hotel" : "house") === building && !buildProblem(game, me, index, true)) : [];
  const [tile, setTile] = useState<number | undefined>(options[0]);
  const bid = Number(amount);
  return <form className="bid-form" onSubmit={(event) => {
    event.preventDefault();
    void send({ type: "bid", amount: bid, tile });
  }}>
    {building && <label className="field"><span>Build on</span><select value={tile ?? ""} onChange={(event) => setTile(Number(event.target.value))} required>
      {options.map((index) => <option key={index} value={index}>{BOARD[index].name}</option>)}
    </select></label>}
    <label className="field"><span>Your bid (₹)</span><input type="number" inputMode="numeric" value={amount}
      onChange={(event) => setAmount(event.target.value)} min={minimum} max={me.cash} required /></label>
    <div className="button-row">
      <button type="submit" className="button button-primary" disabled={disabled || bid < minimum || bid > me.cash || (building !== null && tile === undefined)}>Place bid</button>
      <button type="button" className="button button-secondary" disabled={disabled} onClick={() => void send({ type: "passBid" })}>Pass</button>
    </div>
  </form>;
}

export function TurnPanel({ room, game, disabled, send, onSelect, onManage }: {
  room: RoomView; game: PublicGame; disabled: boolean; send: Send; onSelect: (tile: number) => void; onManage: () => void;
}) {
  const me = game.players.find((player) => player.id === room.me)!;
  const turn = game.players[game.turn];
  const actingId = game.phase === "auction" ? game.auction?.bidder : game.phase === "debt" ? game.debts[0]?.payer : turn.id;
  const acting = game.players.find((player) => player.id === actingId) ?? turn;
  const yourAction = acting.id === me.id;
  const actingSeat = room.seats.find((seat) => seat.id === acting.id);
  const disconnected = !actingSeat?.online;
  const space = game.pendingDeed === null ? undefined : BOARD[game.pendingDeed];
  const auction = game.auction;
  const debt = game.debts[0];
  const [confirmBankruptcy, setConfirmBankruptcy] = useState(false);
  const heading = useId();

  if (game.phase === "finished") {
    const winner = game.players.find((player) => player.id === game.winner);
    return <section className="panel turn-panel winner-panel" aria-labelledby={heading}>
      <span className="section-label"><Trophy size={16} /> Match complete</span>
      <h1 id={heading}>{winner?.id === me.id ? "You won!" : `${winner?.name ?? "A player"} wins!`}</h1>
      <p>{winner?.id === me.id ? "You’re the last player standing." : `${winner?.name ?? "The winner"} is the last player standing.`}</p>
      <Link className="button button-primary full" href="/">Back home <ArrowRight size={17} /></Link>
    </section>;
  }

  let title = yourAction ? "Your turn" : `${acting.name}’s turn`;
  if (game.phase === "purchase") title = yourAction ? "Buy or auction?" : `${acting.name} is deciding`;
  if (game.phase === "auction") title = "Auction";
  if (game.phase === "debt") title = debt.mortgage !== undefined ? "Mortgage transfer" : "Payment due";
  if (game.phase === "jail") title = yourAction ? "You’re in Holding" : `${acting.name} is in Holding`;

  const latestCard = game.card && game.movement?.player === game.card.player ? CARDS[game.card.deck][game.card.index] : null;

  return <section className={`panel turn-panel${yourAction ? " is-your-turn" : ""}`} aria-labelledby={heading}>
    <div className="turn-kicker">
      <span className="section-label">{yourAction ? <span className="turn-dot" /> : <CirclePause size={16} />} {yourAction ? "Your move" : "At the table"}</span>
      <span className="pill">Round {game.round}</span>
    </div>
    <div className="turn-title">
      <h1 id={heading} aria-live="polite">{title}</h1>
      <Dice key={game.dice ? `${game.activity.findLast((entry) => entry.text.includes(" rolled "))?.id ?? 0}` : "idle"} values={game.dice} />
    </div>
    {latestCard && <div className="drawn-card">
      {game.card?.deck === "community" ? <MailOpen size={18} /> : <Ticket size={18} />}
      <div><strong>{latestCard.title}</strong><p>{latestCard.text}</p></div>
    </div>}
    {game.phase === "auction" && auction && <>
      <div className="decision">
        <Gavel size={19} aria-hidden="true" />
        <div><strong>{auction.item.kind === "deed" ? BOARD[auction.item.tile].name : `Last ${auction.item.level} in the bank`}</strong>
          <span>{auction.leader ? `${rupees(auction.highBid)} · ${game.players.find((player) => player.id === auction.leader)?.name} leads` : `Opening bid ${rupees(MIN_BID)}`}</span></div>
      </div>
      {yourAction && <AuctionBid key={`${auction.highBid}-${acting.id}-${auction.item.kind}`} game={game} me={me} send={send} disabled={disabled} />}
    </>}
    {game.phase === "purchase" && isDeed(space) && <>
      <button type="button" className="decision decision-link" onClick={() => onSelect(game.pendingDeed!)}>
        <SpaceIcon space={space} />
        <div><strong>{space.name}</strong><span>{space.type === "city" ? `${MARKET_TIERS[space.tier].name} set` : space.type === "rail" ? "Railway" : "Utility"}</span></div>
        <b>{rupees(space.price)}</b>
      </button>
      {yourAction && <>
        <div className="button-row">
          <button type="button" className="button button-primary" disabled={disabled || me.cash < space.price} onClick={() => void send({ type: "buy" })}>Buy for {rupees(space.price)}</button>
          <button type="button" className="button button-secondary" disabled={disabled} onClick={() => void send({ type: "auction" })}>Auction</button>
        </div>
        {me.cash < space.price && <p className="small muted">You’re short on cash. Send this property to auction.</p>}
      </>}
    </>}
    {game.phase === "debt" && <>
      <div className="decision"><Banknote size={22} aria-hidden="true" /><div><strong>{rupees(debt.amount)} due</strong><span>{debt.reason}</span></div></div>
      {yourAction && <>
        <div className="button-row">
          <button type="button" className="button button-primary" disabled={disabled || me.cash < debt.amount} onClick={() => void send({ type: "payDebt" })}>
            {debt.mortgage !== undefined ? "Pay interest" : "Settle bill"}
          </button>
          {debt.mortgage !== undefined && (() => {
            const deed = BOARD[debt.mortgage];
            if (!isDeed(deed)) return null;
            const cost = mortgageValue(deed) + mortgageInterest(deed);
            return <button type="button" className="button button-secondary" disabled={disabled || me.cash < cost}
              onClick={() => void send({ type: "unmortgage", tile: debt.mortgage! })}>Clear for {rupees(cost)}</button>;
          })()}
        </div>
        {me.cash < debt.amount && <div className="debt-tools">
          <p className="small muted">Raise cash by selling buildings, mortgaging a deed, or offering a trade.</p>
          <button type="button" className="text-button" onClick={onManage}><Building2 size={16} /> Manage properties</button>
          {wealthIfLiquidated(game, me) < debt.amount && <button type="button" className="text-button danger-text" disabled={disabled}
            onClick={() => setConfirmBankruptcy(true)}>Declare bankruptcy</button>}
        </div>}
      </>}
    </>}
    {game.phase === "jail" && yourAction && <>
      <p><LockKeyhole size={15} aria-hidden="true" /> {3 - (me.jail ?? 0)} attempts left to roll doubles.</p>
      <button type="button" className="button button-primary full" disabled={disabled} onClick={() => void send({ type: "roll" })}>
        <Dice5 size={19} /> Try for doubles
      </button>
      <div className="button-row">
        <button type="button" className="button button-secondary" disabled={disabled} onClick={() => void send({ type: "payJail" })}>Pay {rupees(RELEASE_FEE)}</button>
        {me.passes.length > 0 && <button type="button" className="button button-secondary" disabled={disabled} onClick={() => void send({ type: "usePass", deck: me.passes[0] })}>Use Release Pass</button>}
      </div>
    </>}
    {game.phase === "roll" && yourAction && <>
      <p>{game.doubles ? "Doubles! You get another roll." : "Roll both dice to move around the board."}</p>
      <button type="button" className="button button-primary full" disabled={disabled} onClick={() => void send({ type: "roll" })}><Dice5 size={20} /> Roll dice</button>
    </>}
    {game.phase === "end" && yourAction && <>
      <p>Manage your properties or pass the turn to the next player.</p>
      <button type="button" className="button button-primary full" disabled={disabled} onClick={() => void send({ type: "endTurn" })}>End turn <ArrowRight size={18} /></button>
    </>}
    {!yourAction && <p className="waiting-line">
      {actingSeat?.bot ? `${acting.name} is thinking…` : disconnected ? `Waiting for ${acting.name} to reconnect. Their seat is saved.`
        : game.phase === "auction" ? `Waiting for ${acting.name} to bid or pass.`
          : game.phase === "debt" ? `Waiting for ${acting.name} to settle the payment.`
            : game.phase === "purchase" ? `Waiting for ${acting.name} to buy or auction.`
              : `Waiting for ${acting.name} to play.`}
    </p>}
    {confirmBankruptcy && <Dialog title="Declare bankruptcy?" onClose={() => setConfirmBankruptcy(false)}>
      <p>Your cash and properties will be settled with your creditor. You’ll stay in the room to watch the rest of the game.</p>
      <div className="button-row">
        <button type="button" className="button button-secondary" onClick={() => setConfirmBankruptcy(false)}>Go back</button>
        <button type="button" className="button button-danger" disabled={disabled} onClick={async () => {
          if (await send({ type: "bankrupt" })) setConfirmBankruptcy(false);
        }}>Declare bankruptcy</button>
      </div>
    </Dialog>}
  </section>;
}
