"use client";

import { Building2, ChevronRight, CircleDollarSign, LockKeyhole } from "lucide-react";
import { useState } from "react";
import { BOARD, MARKET_TIERS, DEPARTURE_PAY, isDeed, mortgageInterest, mortgageValue, rupees } from "@/game/board";
import { buildCost, buildProblem, tierDeveloped, investmentAllowed, mortgageProblem, sellProblem } from "@/game/economy";
import type { Player, PublicGame, RoomAction } from "@/game/types";
import { SpaceIcon, Token } from "./icons";
import { Dialog } from "./shared";
import type { Send } from "./use-room";

const tileDescription = {
  departure: `Collect ${rupees(DEPARTURE_PAY)} when you pass or land here.`,
  jail: "You’re just visiting if you land here normally. A detour, certain cards, and three consecutive doubles can send you to Holding.",
  rest: "Take a break. You don’t pay or collect anything here.",
  detour: "Go straight to Holding and end your turn. Crossing Departure on the way earns no payment.",
  dispatch: "Draw a Journey card and follow its instructions.",
  community: "Draw a City Post card and follow its instructions.",
};

export function PropertyDialog({ tile, game, me, disabled, send, onClose }: {
  tile: number; game: PublicGame; me: Player; disabled: boolean; send: Send; onClose: () => void;
}) {
  const space = BOARD[tile];
  const deed = game.deeds[tile];
  const owner = game.players.find((player) => player.id === deed?.owner);
  const city = space.type === "city" ? MARKET_TIERS[space.tier] : null;
  const occupants = game.players.filter((player) => !player.bankrupt && player.position === tile);
  const manageable = owner?.id === me.id && investmentAllowed(game, me.id);
  const debt = game.phase === "debt" ? game.debts[0] : undefined;
  const [confirmation, setConfirmation] = useState(false);
  const sellReason = sellProblem(game, me, tile);
  const buildReason = buildProblem(game, me, tile);
  const mortgageReason = mortgageProblem(game, me, tile);

  function control(label: string, action: RoomAction, problem?: string | null, icon = <Building2 size={16} />) {
    return <div className="property-control">
      <button type="button" className="button button-secondary" disabled={disabled || Boolean(problem)} onClick={() => void send(action)}>{icon}{label}</button>
      {problem && <small>{problem}</small>}
    </div>;
  }

  return <Dialog title={space.name} onClose={onClose}>
    <div className="property-meta">
      {city ? <span><i className="city-dot" style={{ background: city.color }} />{city.name} set</span>
        : <span><SpaceIcon space={space} size={16} />{space.type === "rail" ? "Railway" : space.type === "utility" ? "Utility" : "Board space"}</span>}
      {owner && <span><Token index={owner.token} />{owner.name}</span>}
      {deed?.mortgaged && <span><LockKeyhole size={14} /> Mortgaged</span>}
    </div>
    {occupants.length > 0 && <p className="notice">Here now · {occupants.map((player) => player.name).join(", ")}</p>}
    {isDeed(space) ? <>
      <dl className="deed-prices">
        <div><dt>Purchase price</dt><dd>{rupees(space.price)}</dd></div>
        <div><dt>Mortgage value</dt><dd>{rupees(mortgageValue(space))}</dd></div>
        {city && <div><dt>Per house or upgrade</dt><dd>{rupees(city.build)}</dd></div>}
      </dl>
      {space.type === "city" ? <dl className="rent-table">
        {["Base rent", "1 house", "2 houses", "3 houses", "4 houses", "Hotel"].map((label, level) => <div key={label} className={deed?.level === level ? "rent-active" : ""}>
          <dt>{label}</dt><dd>{rupees(space.rents[level])}</dd>
        </div>)}
      </dl> : space.type === "rail" ? <dl className="rent-table">
        {[1, 2, 3, 4].map((count) => <div key={count}><dt>{count} {count === 1 ? "railway" : "railways"} owned</dt><dd>{rupees(250 * 2 ** (count - 1))}</dd></div>)}
      </dl> : <p>Rent is {rupees(40)} times the dice total, or {rupees(100)} times the total if the same player owns both utilities.</p>}
      {space.type === "city" && <p className="small muted">A complete colour set doubles base rent on undeveloped citys.</p>}
      {manageable && deed && <div className="property-actions">
        <h3>Manage property</h3>
        {deed.mortgaged ? (() => {
          const cost = mortgageValue(space) + mortgageInterest(space);
          return control(`Clear mortgage · ${rupees(cost)}`, { type: "unmortgage", tile },
            debt && debt.mortgage !== tile ? "Settle the current bill first." : me.cash < cost ? "You need more cash to clear this mortgage." : null,
            <LockKeyhole size={16} />);
        })() : control(`Mortgage · ${rupees(mortgageValue(space))}`, { type: "mortgage", tile }, mortgageReason, <CircleDollarSign size={16} />)}
        {space.type === "city" && !deed.mortgaged && <>
          {!debt && control(`Build ${deed.level === 4 ? "hotel" : "house"} · ${rupees(buildCost(tile))}`, { type: "build", tile }, buildReason)}
          {deed.level > 0 && control(`Sell ${deed.level === 5 ? "hotel" : "house"} · ${rupees(buildCost(tile) / 2)}`, { type: "sell", tile }, sellReason)}
          {tierDeveloped(game, space.tier) && (confirmation ? <div className="button-row">
            <button type="button" className="button button-danger" disabled={disabled} onClick={async () => {
              if (await send({ type: "sellGroup", tile })) setConfirmation(false);
            }}>Confirm sale of all buildings</button>
            <button type="button" className="button button-secondary" onClick={() => setConfirmation(false)}>Cancel</button>
          </div> : <button type="button" className="text-button danger-text" disabled={disabled} onClick={() => setConfirmation(true)}>Sell all buildings in the {city?.name} set</button>)}
        </>}
      </div>}
    </> : <p>{space.type === "tax" ? `Pay ${rupees(space.amount)} to the bank.` : tileDescription[space.type]}</p>}
  </Dialog>;
}

export function BrowseDialog({ onClose, onSelect }: { onClose: () => void; onSelect: (index: number) => void }) {
  return <Dialog title="Browse spaces" onClose={onClose} wide>
    <div className="browse-list">
      {BOARD.map((space, index) => <button type="button" key={index} onClick={() => onSelect(index)}>
        <span className="list-space-icon" style={space.type === "city" ? { color: MARKET_TIERS[space.tier].color } : undefined}><SpaceIcon space={space} size={18} /></span>
        <span><strong>{space.name}</strong>{space.type === "city" && <small>{`${MARKET_TIERS[space.tier].name} set`}</small>}</span>
        {isDeed(space) && <b>{rupees(space.price)}</b>}<ChevronRight size={16} />
      </button>)}
    </div>
  </Dialog>;
}
