"use client";

import { useEffect, useRef } from "react";
import { Compass, LockKeyhole, Route } from "lucide-react";
import { BOARD, MARKET_TIERS, isDeed, rupees, TOKENS } from "@/game/board";
import type { Player, PublicGame } from "@/game/types";
import { SpaceIcon, Token } from "./icons";

function coordinates(index: number): [number, number] {
  if (index <= 10) return [index, 0];
  if (index <= 20) return [10, index - 10];
  if (index <= 30) return [30 - index, 10];
  return [0, 40 - index];
}

const tracks = [1.42, ...Array<number>(9).fill(1), 1.42];
const total = tracks.reduce((sum, value) => sum + value, 0);
const innerEdge = tracks[0] / total;
const center = (track: number) => (tracks.slice(0, track).reduce((sum, value) => sum + value, 0) + tracks[track] / 2) / total;

function anchor(index: number) {
  const [col, row] = coordinates(index);
  const inset = innerEdge + .013;
  return [col === 0 ? inset : col === 10 ? 1 - inset : center(col),
    row === 0 ? inset : row === 10 ? 1 - inset : center(row)];
}

function TokenStack({ tile, players, current }: { tile: number; players: Player[]; current?: string }) {
  const [x, y] = anchor(tile);
  return <div className="pawn-stack" style={{ left: `${x * 100}%`, top: `${y * 100}%` }} aria-hidden="true">
    {players.map((player) => <Token key={player.id} index={player.token} className={player.id === current ? "pawn-active" : ""} />)}
  </div>;
}

export function Board({ game, revision, onSelect, onBrowse }: {
  game?: PublicGame | null; revision: number; onSelect?: (index: number) => void; onBrowse?: () => void;
}) {
  const grid = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const previous = useRef<number | null>(null);
  const movement = game?.movement;
  const mover = movement && game?.players.find((player) => player.id === movement.player);
  const token = mover?.token;
  useEffect(() => {
    const last = previous.current;
    previous.current = revision;
    const field = grid.current;
    const moving = overlay.current;
    if (!field || !moving || !movement || token === undefined || last === null || last + 1 !== revision ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const { width, height } = field.getBoundingClientRect();
    const animatePath = movement.teleport ? [movement.path[0], movement.path.at(-1)!] : movement.path;
    if (animatePath.length < 2) return;
    // Hide the destination chip only for the brief duration of the moving copy.
    const finalChip = field.querySelector<HTMLElement>(`[data-seat="${token}"] .pawn-stack`);
    const invisible = finalChip?.animate([{ opacity: 0 }, { opacity: 0 }], { duration: Math.min(760, 210 + 48 * animatePath.length) });
    const animation = moving.animate(animatePath.map((index, step) => {
      const [x, y] = anchor(index);
      return {
        transform: `translate(${x * width}px, ${y * height}px) translate(-50%, -50%)`,
        opacity: movement.teleport && step !== 0 ? .8 : 1,
      };
    }), { duration: Math.min(760, 210 + 48 * animatePath.length), easing: "ease-out" });
    return () => { animation.cancel(); invisible?.cancel(); };
  }, [movement, revision, token]);

  const current = game?.players[game.turn];
  const playersBySpace = new Map<number, Player[]>();
  game?.players.filter((player) => !player.bankrupt).forEach((player) => {
    playersBySpace.set(player.position, [...(playersBySpace.get(player.position) ?? []), player]);
  });
  return <div className="board-block">
    <div className="board-frame">
      <div className="board-grid" ref={grid} aria-label="Ponomoly game board">
        <div className="board-art">
          <div className="board-stamp"><Compass size={19} aria-hidden="true" /><span>INDIA EDITION</span></div>
          <div className="board-signature" aria-hidden="true">Ponomoly</div>
        </div>
        {BOARD.map((space, index) => {
          const [col, row] = coordinates(index);
          const edge = row === 0 ? "top" : col === 10 ? "right" : row === 10 ? "bottom" : "left";
          const corner = index % 10 === 0;
          const city = space.type === "city" ? MARKET_TIERS[space.tier] : null;
          const deed = game?.deeds[index];
          const owner = deed && game?.players.find((player) => player.id === deed.owner);
          const players = playersBySpace.get(index) ?? [];
          const isCurrent = players.some((player) => player.id === current?.id);
          const style = {
            gridColumn: col + 1, gridRow: row + 1,
            "--city": city?.color, "--owner": owner ? TOKENS[owner.token].color : undefined,
          } as React.CSSProperties;
          const label = [
            space.name, city ? `${city.name} set` : null, isDeed(space) ? rupees(space.price) : null, owner ? `owned by ${owner.name}` : null,
            deed?.mortgaged ? "mortgaged" : null, deed?.level ? deed.level === 5 ? "hotel" : `${deed.level} houses` : null,
            players.length ? players.map((player) => player.name).join(", ") : null,
          ].filter(Boolean).join(", ");
          const content = <>
            {city && <i className="tile-band" />}
            <span className="tile-content">
              {space.type !== "city" && <span className="tile-icon"><SpaceIcon space={space} /></span>}
              {space.type === "city" && <span className="tile-city">{space.compact}</span>}
              <span className="tile-name">{space.name}</span>
              {isDeed(space) && <span className="tile-price">{rupees(space.price)}</span>}
              {space.type === "tax" && <span className="tile-price">{rupees(space.amount)}</span>}
            </span>
            {owner && <span className="tile-owner" aria-hidden="true">
              {deed?.mortgaged ? <LockKeyhole size={10} /> : !!deed?.level && <span>{deed.level === 5 ? "H" : deed.level}</span>}
            </span>}
          </>;
          const className = `tile edge-${edge} tile-${space.type}${city ? " tile-city-space" : ""}${corner ? " tile-corner" : ""}${isCurrent ? " tile-current" : ""}`;
          return onSelect
            ? <button key={index} type="button" className={className} style={style} onClick={() => onSelect(index)}
              aria-label={label} title={label}>{content}</button>
            : <div key={index} className={className} style={style} title={label}>{content}</div>;
        })}
        <div className="pawn-layer">
          {[...playersBySpace].map(([tile, players]) => <div key={tile} data-seat={players.length === 1 ? players[0].token : undefined}>
            <TokenStack tile={tile} players={players} current={current?.id} />
          </div>)}
          {token !== undefined && <div className="moving-pawn" ref={overlay} aria-hidden="true"><Token index={token} className="pawn-active" /></div>}
        </div>
      </div>
    </div>
    <div className="board-caption">
      <div className="board-legend" aria-label="Property colour sets">
        {MARKET_TIERS.map((city) => <span key={city.name}><i style={{ background: city.color }} />{city.name}</span>)}
      </div>
      {onBrowse && <button className="text-button" type="button" onClick={onBrowse}><Route size={16} /> Browse spaces</button>}
    </div>
  </div>;
}
