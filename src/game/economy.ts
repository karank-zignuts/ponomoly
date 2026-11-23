import { BID_INCREMENT, BOARD, MARKET_TIERS, TIER_DEEDS, HOTEL_SUPPLY, HOUSE_SUPPLY, isDeed, MIN_BID, mortgageValue, rupees } from "./board";
import type { Auction, Game, Player, PublicGame, TradeSide } from "./types";

type Economy = Pick<PublicGame, "players" | "deeds">;

export function ownsTier(game: Economy, city: number, player: string) {
  return TIER_DEEDS[city].every((index) => game.deeds[index]?.owner === player);
}

export function tierDeveloped(game: Economy, city: number) {
  return TIER_DEEDS[city].some((index) => (game.deeds[index]?.level ?? 0) > 0);
}

export function bankStock(game: Economy) {
  return Object.values(game.deeds).reduce((stock, deed) => {
    if (deed.level === 5) stock.hotels--;
    else stock.houses -= deed.level;
    return stock;
  }, { houses: HOUSE_SUPPLY, hotels: HOTEL_SUPPLY });
}

export function buildCost(tile: number) {
  const space = BOARD[tile];
  return space?.type === "city" ? MARKET_TIERS[space.tier].build : 0;
}

export function buildProblem(game: Economy, player: Player, tile: number, ignoreCash = false) {
  const space = BOARD[tile];
  const deed = game.deeds[tile];
  if (space?.type !== "city" || deed?.owner !== player.id) return "Choose a city you own.";
  if (!ownsTier(game, space.tier, player.id)) return "You need every city in this set.";
  const group = TIER_DEEDS[space.tier].map((index) => game.deeds[index]);
  if (group.some((item) => item.mortgaged)) return "Release every mortgage in this set first.";
  if (deed.level === 5) return "This city already has a hotel.";
  if (group.some((item) => item.level < deed.level)) return "Build on the least developed city first.";
  const stock = bankStock(game);
  if (deed.level === 4 ? stock.hotels < 1 : stock.houses < 1) {
    return deed.level === 4 ? "The bank is out of hotels." : "The bank is out of houses.";
  }
  if (!ignoreCash && player.cash < buildCost(tile)) return `You need ${rupees(buildCost(tile))} in cash.`;
  return null;
}

export function sellProblem(game: Economy, player: Player, tile: number) {
  const space = BOARD[tile];
  const deed = game.deeds[tile];
  if (space?.type !== "city" || deed?.owner !== player.id || deed.level === 0) return "There is no building to sell here.";
  if (TIER_DEEDS[space.tier].some((index) => (game.deeds[index]?.level ?? 0) > deed.level)) {
    return "Sell from the most developed city first.";
  }
  if (deed.level === 5 && bankStock(game).houses < 4) return "The bank needs four houses to exchange for your hotel. You can sell all buildings in the city.";
  return null;
}

export function mortgageProblem(game: Economy, player: Player, tile: number) {
  const space = BOARD[tile];
  const deed = game.deeds[tile];
  if (!isDeed(space) || deed?.owner !== player.id) return "Choose a property you own.";
  if (deed.mortgaged) return "This property is already mortgaged.";
  if (space.type === "city" && tierDeveloped(game, space.tier)) return "Sell all buildings in this set first.";
  return null;
}

export function canTradeDeed(game: Economy, player: string, tile: number) {
  const space = BOARD[tile];
  return isDeed(space) && game.deeds[tile]?.owner === player
    && (space.type !== "city" || !tierDeveloped(game, space.tier));
}

export function tradeProblem(game: Economy, player: Player, side: TradeSide) {
  if (side.cash > player.cash) return `${player.name} no longer has enough cash.`;
  if (side.deeds.some((tile) => !canTradeDeed(game, player.id, tile))) {
    return `${player.name} must own the listed properties and sell any buildings in their colour sets before trading.`;
  }
  if (side.passes.some((deck) => !player.passes.includes(deck))) return `${player.name} no longer holds the listed pass.`;
  return null;
}

export function wealthIfLiquidated(game: Economy, player: Player) {
  return Object.entries(game.deeds).reduce((total, [key, state]) => {
    const tile = Number(key);
    const space = BOARD[tile];
    if (!isDeed(space) || state.owner !== player.id) return total;
    return total + (state.mortgaged ? 0 : mortgageValue(space)) + state.level * (buildCost(tile) / 2);
  }, player.cash);
}

export function landingRent(game: Economy, tile: number, rollTotal: number, special?: "doubleRail" | "specialUtility") {
  const deed = game.deeds[tile];
  const space = BOARD[tile];
  if (!deed || deed.mortgaged || !isDeed(space)) return 0;
  if (space.type === "city") {
    const factor = deed.level === 0 && ownsTier(game, space.tier, deed.owner) ? 2 : 1;
    return space.rents[deed.level] * factor;
  }
  const count = Object.entries(game.deeds).filter(([key, item]) =>
    item.owner === deed.owner && BOARD[Number(key)].type === space.type).length;
  if (space.type === "rail") return 250 * 2 ** (count - 1) * (special === "doubleRail" ? 2 : 1);
  return rollTotal * (special === "specialUtility" || count > 1 ? 100 : 40);
}

export function investmentAllowed(game: Pick<Game, "phase" | "players" | "turn" | "debts">, id: string) {
  if (game.phase === "debt") return game.debts[0]?.payer === id;
  return game.phase !== "auction" && game.phase !== "finished" && game.players.some((player) => player.id === id && !player.bankrupt);
}

export function minimumBid(auction: Auction) {
  return auction.highBid ? auction.highBid + BID_INCREMENT : MIN_BID;
}
