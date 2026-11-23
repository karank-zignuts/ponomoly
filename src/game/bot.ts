import { BOARD, isDeed, MARKET_TIERS, MIN_BID, mortgageInterest, mortgageValue, RELEASE_FEE, TIER_DEEDS } from "./board";
import { bankStock, buildCost, buildProblem, canTradeDeed, landingRent, minimumBid, mortgageProblem, ownsTier, sellProblem } from "./economy";
import type { GameAction, Player, PublicGame, TradeSide } from "./types";

const rollWeights = [0, 0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1];

function nearbyRent(game: PublicGame, player: Player) {
  let expected = 0;
  let severe = 0;
  for (let roll = 2; roll <= 12; roll++) {
    const tile = (player.position + roll) % BOARD.length;
    const space = BOARD[tile];
    const rent = game.deeds[tile] && game.deeds[tile].owner !== player.id ? landingRent(game, tile, roll) : 0;
    const cost = space.type === "tax" ? space.amount : rent;
    expected += cost * rollWeights[roll] / 36;
    if (rollWeights[roll] >= 3) severe = Math.max(severe, cost);
  }
  return expected * 2 + severe * .31;
}

function reserve(game: PublicGame, player: Player) {
  return Math.min(6000, Math.round(900 + Math.min(1150, game.round * 55) + nearbyRent(game, player)));
}

function titleValue(game: PublicGame, player: Player, tile: number, defensive = false) {
  const space = BOARD[tile];
  if (!isDeed(space)) return 0;
  const property = game.deeds[tile];
  let value = space.price * (space.type === "city" ? .94 : 1.05);
  if (space.type === "city") {
    const siblings = TIER_DEEDS[space.tier].filter((index) => index !== tile);
    const mine = siblings.filter((index) => game.deeds[index]?.owner === player.id).length;
    const rival = game.players.some((other) =>
      !other.bankrupt && other.id !== player.id && siblings.every((index) => game.deeds[index]?.owner === other.id));
    value += space.price * (mine === siblings.length ? .96 : mine ? .28 : .10);
    if (defensive && rival) value += space.price * .30;
  } else {
    const same = Object.entries(game.deeds).filter(([key, deed]) =>
      Number(key) !== tile && deed.owner === player.id && BOARD[Number(key)].type === space.type).length;
    value *= 1 + same * (space.type === "rail" ? .22 : .42);
  }
  if (property?.mortgaged) value -= mortgageValue(space) + mortgageInterest(space);
  return Math.max(0, value);
}

function purchaseLimit(game: PublicGame, player: Player, tile: number) {
  const space = BOARD[tile];
  if (!isDeed(space)) return 0;
  const completesSet = space.type === "city" && TIER_DEEDS[space.tier].every((index) =>
    index === tile || game.deeds[index]?.owner === player.id);
  const heldCash = reserve(game, player) * (completesSet ? .62 : .90);
  return Math.max(0, Math.floor(Math.min(player.cash - heldCash, titleValue(game, player, tile, true)) / 10) * 10);
}

function ownDeeds(game: PublicGame, id: string) {
  return Object.entries(game.deeds).flatMap(([key, deed]) => deed.owner === id ? [Number(key)] : []);
}

function investment(game: PublicGame, player: Player): GameAction | null {
  const kept = reserve(game, player);
  const proposals: { action: GameAction; score: number }[] = [];
  for (const tile of ownDeeds(game, player.id)) {
    const space = BOARD[tile];
    const deed = game.deeds[tile];
    if (!isDeed(space) || space.type !== "city" || !ownsTier(game, space.tier, player.id)) continue;
    if (deed.mortgaged) {
      const principalAndInterest = mortgageValue(space) + mortgageInterest(space);
      if (player.cash - principalAndInterest > kept) {
        proposals.push({ action: { type: "unmortgage", tile }, score: .63 + space.rents[0] / principalAndInterest });
      }
    } else if (!buildProblem(game, player, tile) && player.cash - buildCost(tile) >= kept) {
      const gain = space.rents[deed.level + 1] - space.rents[deed.level] * (deed.level === 0 ? 2 : 1);
      // A city opponents are likely to visit next is a better upgrade than one they just passed.
      const exposure = game.players.filter((other) => !other.bankrupt && other.id !== player.id).reduce((total, other) => {
        const distance = (tile - other.position + BOARD.length) % BOARD.length;
        return total + (rollWeights[distance] ?? 0);
      }, 0);
      proposals.push({ action: { type: "build", tile }, score: gain / buildCost(tile) * (1 + exposure * .1) });
    }
  }
  return proposals.sort((a, b) => b.score - a.score)[0]?.action ?? null;
}

function handleDebt(game: PublicGame, player: Player): GameAction {
  const bill = game.debts[0];
  if (bill.mortgage !== undefined) {
    const space = BOARD[bill.mortgage];
    if (isDeed(space) && player.cash - mortgageValue(space) - mortgageInterest(space) >= reserve(game, player)) {
      return { type: "unmortgage", tile: bill.mortgage };
    }
  }
  if (player.cash >= bill.amount) return { type: "payDebt" };
  const options: { action: GameAction; loss: number }[] = [];
  const amountNeeded = bill.amount - player.cash;
  const stock = bankStock(game);
  for (const tile of ownDeeds(game, player.id)) {
    const space = BOARD[tile];
    const deed = game.deeds[tile];
    if (!isDeed(space)) continue;
    if (!mortgageProblem(game, player, tile)) {
      const penalty = space.type === "city" && ownsTier(game, space.tier, player.id) ? 1.35 : 0;
      options.push({ action: { type: "mortgage", tile }, loss: titleValue(game, player, tile) / mortgageValue(space) + penalty + (mortgageValue(space) < amountNeeded ? .16 : 0) });
    }
    if (space.type === "city" && deed.level > 0) {
      const proceeds = buildCost(tile) / 2;
      const before = space.rents[deed.level];
      if (!sellProblem(game, player, tile)) {
        const after = space.rents[deed.level - 1] * (deed.level === 1 ? 2 : 1);
        options.push({ action: { type: "sell", tile }, loss: (before - after) / proceeds + .9 + (proceeds < amountNeeded ? .16 : 0) });
      } else if (deed.level === 5 && stock.houses < 4) {
        options.push({ action: { type: "sellGroup", tile }, loss: 7 });
      }
    }
  }
  return options.sort((a, b) => a.loss - b.loss)[0]?.action ?? { type: "bankrupt" };
}

function tradeValue(game: PublicGame, player: Player, side: TradeSide) {
  return side.cash + side.passes.length * (player.jail === null ? 290 : 470)
    + side.deeds.reduce((total, tile) => total + titleValue(game, player, tile), 0);
}

function tradeCompletes(game: PublicGame, player: Player, receive: TradeSide, give: TradeSide) {
  return receive.deeds.some((tile) => {
    const space = BOARD[tile];
    return space.type === "city" && TIER_DEEDS[space.tier].every((index) =>
      receive.deeds.includes(index) || (!give.deeds.includes(index) && game.deeds[index]?.owner === player.id));
  });
}

function respondToTrade(game: PublicGame, player: Player): GameAction {
  const trade = game.trade!;
  const offerer = game.players.find((other) => other.id === trade.from)!;
  const valid = !offerer.bankrupt && trade.want.cash <= player.cash &&
    trade.give.cash <= offerer.cash && trade.want.passes.every((pass) => player.passes.includes(pass)) &&
    trade.give.passes.every((pass) => offerer.passes.includes(pass)) &&
    trade.want.deeds.every((tile) => canTradeDeed(game, player.id, tile)) &&
    trade.give.deeds.every((tile) => canTradeDeed(game, offerer.id, tile));
  const wantsSet = tradeCompletes(game, player, trade.give, trade.want);
  const rivalSet = tradeCompletes(game, offerer, trade.want, trade.give);
  const giftedMortgage = [...trade.give.deeds, ...trade.want.deeds].some((tile) => game.deeds[tile]?.mortgaged);
  const gain = tradeValue(game, player, trade.give);
  const cost = tradeValue(game, player, trade.want) * (rivalSet && !wantsSet ? 1.38 : 1.07);
  const liquidity = player.cash + trade.give.cash - trade.want.cash;
  const safe = liquidity >= reserve(game, player) * (wantsSet ? .45 : .8) || liquidity >= player.cash;
  const accepted = valid && safe && gain >= cost && (game.phase !== "debt" || !giftedMortgage);
  return { type: accepted ? "acceptTrade" : "declineTrade", tradeId: trade.id };
}

function offerTrade(game: PublicGame, player: Player): GameAction | null {
  if (game.trade) return null;
  for (const group of TIER_DEEDS) {
    const missing = group.filter((tile) => game.deeds[tile]?.owner !== player.id);
    if (missing.length !== 1) continue;
    const tile = missing[0];
    const owner = game.players.find((other) => other.id === game.deeds[tile]?.owner);
    if (!owner || !canTradeDeed(game, owner.id, tile) || game.deeds[tile].mortgaged) continue;
    const askingValue = titleValue(game, owner, tile);
    const amount = Math.ceil(askingValue * 1.55 / 50) * 50;
    const ceiling = Math.min(titleValue(game, player, tile) * .88, player.cash - reserve(game, player));
    if (amount > ceiling) continue;
    return {
      type: "offerTrade", to: owner.id,
      give: { cash: amount, deeds: [], passes: [] }, want: { cash: 0, deeds: [tile], passes: [] },
    };
  }
  return null;
}

export function nextBot(game: PublicGame, bots: Set<string>) {
  if (game.phase === "finished") return null;
  if (game.phase !== "auction" && game.trade && bots.has(game.trade.to)) return game.trade.to;
  const next = game.phase === "debt" ? game.debts[0]?.payer
    : game.phase === "auction" ? game.auction?.bidder
      : game.players[game.turn].id;
  return next && bots.has(next) ? next : null;
}

function bidForBuilding(game: PublicGame, player: Player, building: "house" | "hotel") {
  let choice: { tile: number; limit: number } | null = null;
  for (const [key, deed] of Object.entries(game.deeds)) {
    const tile = Number(key);
    const space = BOARD[tile];
    if (space.type !== "city" || (deed.level === 4 ? "hotel" : "house") !== building || buildProblem(game, player, tile, true)) continue;
    const gain = space.rents[deed.level + 1] - space.rents[deed.level] * (deed.level === 0 ? 2 : 1);
    const limit = Math.min(player.cash - reserve(game, player), Math.max(gain * 1.72, MARKET_TIERS[space.tier].build * .88));
    if (limit >= MIN_BID && (!choice || limit > choice.limit)) choice = { tile, limit };
  }
  return choice;
}

function suggestedBid(minimum: number, ceiling: number, value: number, highBid: number) {
  if (ceiling < minimum) return 0;
  // Increase thoughtfully so two bots do not trade tiny bids for several minutes.
  const jump = highBid ? highBid + Math.max(60, highBid * .13) : value * .38;
  return Math.max(minimum, Math.min(Math.floor(ceiling), Math.ceil(jump / 10) * 10));
}

export function chooseBotAction(game: PublicGame, id: string, tradedThisRound: boolean): GameAction {
  const player = game.players.find((candidate) => candidate.id === id)!;
  if (game.trade?.to === id && game.phase !== "auction") return respondToTrade(game, player);
  switch (game.phase) {
    case "roll": return { type: "roll" };
    case "jail": {
      // Early travel finds unclaimed deeds. Later, Holding can protect cash from developed opponents.
      const earlyGame = Object.keys(game.deeds).length < 16;
      const worthLeaving = earlyGame || nearbyRent(game, player) < RELEASE_FEE * .82;
      if (worthLeaving && player.passes.length) return { type: "usePass", deck: player.passes[0] };
      if (worthLeaving && player.cash - RELEASE_FEE > reserve(game, player)) return { type: "payJail" };
      return { type: "roll" };
    }
    case "purchase": {
      const tile = game.pendingDeed!;
      const space = BOARD[tile];
      return { type: isDeed(space) && purchaseLimit(game, player, tile) >= space.price ? "buy" : "auction" };
    }
    case "auction": {
      const auction = game.auction!;
      const minimum = minimumBid(auction);
      if (auction.item.kind === "deed") {
        const space = BOARD[auction.item.tile];
        const amount = suggestedBid(minimum, purchaseLimit(game, player, auction.item.tile), isDeed(space) ? space.price : minimum, auction.highBid);
        return amount ? { type: "bid", amount } : { type: "passBid" };
      }
      const proposal = bidForBuilding(game, player, auction.item.level);
      const amount = proposal && suggestedBid(minimum, proposal.limit, buildCost(proposal.tile), auction.highBid);
      return amount && proposal ? { type: "bid", amount, tile: proposal.tile } : { type: "passBid" };
    }
    case "debt": return handleDebt(game, player);
    case "end": {
      const upgrade = investment(game, player);
      if (upgrade) return upgrade;
      const trade = !tradedThisRound && offerTrade(game, player);
      return trade || { type: "endTurn" };
    }
    case "finished": throw new Error("A finished game cannot schedule a bot.");
  }
}
