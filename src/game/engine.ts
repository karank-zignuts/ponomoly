import {
  BOARD, MARKET_TIERS, TIER_DEEDS, DEPARTURE_PAY, isDeed, JAIL_INDEX, MIN_BID,
  mortgageInterest, mortgageValue, RELEASE_FEE, rupees, STARTING_CASH,
} from "./board";
import { CARDS, type Deck } from "./cards";
import {
  bankStock, buildCost, buildProblem, investmentAllowed, landingRent, minimumBid, mortgageProblem, sellProblem,
  tradeProblem, wealthIfLiquidated,
} from "./economy";
import type { Activity, AuctionItem, Debt, Game, GameAction, PhaseAfterDebt, Player, PublicGame, Seat } from "./types";

export class RuleError extends Error {}

function requireRule(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RuleError(message);
}

type Random = (maxExclusive: number) => number;
const roll = (random: Random): [number, number] => [random(6) + 1, random(6) + 1];
const sum = (dice: [number, number]) => dice[0] + dice[1];
const current = (game: Game) => game.players[game.turn];
const active = (game: Game) => game.players.filter((player) => !player.bankrupt);
const find = (game: Game, id: string) => game.players.find((player) => player.id === id);

function shuffle(length: number, random: Random) {
  const indices = Array.from({ length }, (_, index) => index);
  for (let index = length - 1; index > 0; index--) {
    const swap = random(index + 1);
    [indices[index], indices[swap]] = [indices[swap], indices[index]];
  }
  return indices;
}

function log(game: Game, text: string, kind: Activity["kind"] = "system") {
  game.activity = [...game.activity.slice(-79), { id: ++game.sequence, text, kind }];
}

export function createGame(seats: Pick<Seat, "id" | "name" | "token">[], random: Random): Game {
  const opening = shuffle(seats.length, random).map((index) => ({ index, total: sum(roll(random)) }));
  const first = opening.reduce((winner, entry) => entry.total > winner.total ? entry : winner);
  const order = [...seats.slice(first.index), ...seats.slice(0, first.index)];
  const game: Game = {
    players: order.map((seat) => ({
      id: seat.id, name: seat.name, token: seat.token,
      cash: STARTING_CASH, position: 0, jail: null, bankrupt: false, passes: [],
    })),
    turn: 0, round: 1, phase: "roll", deeds: {}, dice: null, doubles: 0, extraRoll: false,
    pendingDeed: null, auction: null, auctionQueue: [], auctionAfter: "landing", debts: [],
    afterDebt: "landing", trade: null, winner: null, activity: [], sequence: 0,
    movement: null, card: null, deck: {
      dispatch: shuffle(CARDS.dispatch.length, random), community: shuffle(CARDS.community.length, random),
    },
  };
  log(game, `${current(game).name} goes first with an opening roll of ${first.total}. Everyone starts with ${rupees(STARTING_CASH)}.`, "turn");
  return game;
}

export function publicGame(game: Game): PublicGame {
  const { deck, auctionQueue, auctionAfter, afterDebt, ...visible } = game;
  void [deck, auctionQueue, auctionAfter, afterDebt];
  return visible;
}

function finishIfWon(game: Game) {
  const remaining = active(game);
  if (remaining.length !== 1) return false;
  game.phase = "finished";
  game.winner = remaining[0].id;
  game.debts = [];
  game.auction = null;
  game.auctionQueue = [];
  game.trade = null;
  game.pendingDeed = null;
  log(game, `${remaining[0].name} wins Ponomoly!`, "turn");
  return true;
}

function nextTurn(game: Game) {
  if (finishIfWon(game)) return;
  const count = game.players.length;
  let next = (game.turn + 1) % count;
  while (game.players[next].bankrupt) next = (next + 1) % count;
  if (next <= game.turn) game.round++;
  game.turn = next;
  game.phase = current(game).jail === null ? "roll" : "jail";
  game.doubles = 0;
  game.extraRoll = false;
  game.dice = null;
  log(game, `It's ${current(game).name}’s turn.`, "turn");
}

function afterLanding(game: Game) {
  game.pendingDeed = null;
  if (game.extraRoll) {
    game.extraRoll = false;
    game.phase = "roll";
    log(game, `${current(game).name} rolled doubles and rolls again.`, "turn");
  } else {
    // Sending a player to holding immediately passes the turn. Visiting never does.
    if (current(game).jail !== null) nextTurn(game);
    else game.phase = "end";
  }
}

function trackMove(game: Game, player: Player, path: number[], teleport = false) {
  const past = game.movement?.player === player.id && !game.movement.teleport
    ? game.movement.path : [player.position];
  player.position = path.at(-1) ?? player.position;
  game.movement = { id: ++game.sequence, player: player.id, path: [...past, ...path], teleport };
}

function advance(game: Game, player: Player, steps: number) {
  if (steps > 0 && player.position + steps >= BOARD.length) {
    player.cash += DEPARTURE_PAY;
    log(game, `${player.name} crossed Departure and collected ${rupees(DEPARTURE_PAY)}.`, "money");
  }
  const path = Array.from({ length: Math.abs(steps) }, (_, index) =>
    (player.position + Math.sign(steps) * (index + 1) + BOARD.length) % BOARD.length);
  trackMove(game, player, path);
}

function goToHolding(game: Game, player: Player) {
  trackMove(game, player, [JAIL_INDEX], true);
  player.jail = 0;
  game.extraRoll = false;
  log(game, `${player.name} went directly to Holding.`, "move");
  nextTurn(game);
}

function queueBills(game: Game, debts: Debt[], after: PhaseAfterDebt, random: Random) {
  game.debts = debts.filter((debt) => debt.amount > 0);
  game.afterDebt = after;
  resolveBills(game, random);
}

function paid(game: Game, debt: Debt, player: Player) {
  player.cash -= debt.amount;
  const creditor = debt.creditor ? find(game, debt.creditor) : undefined;
  if (creditor && !creditor.bankrupt) creditor.cash += debt.amount;
  log(game, `${player.name} paid ${rupees(debt.amount)} ${creditor ? `to ${creditor.name}` : "to the bank"} for ${debt.reason}.`, "money");
}

function resolveBills(game: Game, random: Random) {
  while (game.debts.length > 0) {
    const debt = game.debts[0];
    const player = find(game, debt.payer);
    const creditor = debt.creditor ? find(game, debt.creditor) : undefined;
    if (!player || player.bankrupt || creditor?.bankrupt) {
      game.debts.shift();
      continue;
    }
    if (debt.mortgage !== undefined || player.cash < debt.amount) {
      game.phase = "debt";
      return;
    }
    paid(game, debt, player);
    game.debts.shift();
  }
  const after = game.afterDebt;
  if (after === "jailMove") {
    current(game).jail = null;
    advance(game, current(game), sum(game.dice!));
    land(game, random);
  } else if (after === "landing") {
    afterLanding(game);
  } else if (after === "nextTurn") {
    nextTurn(game);
  } else {
    game.phase = after;
  }
}

function mortgageDues(game: Game, tiles: number[], debtor: Player): Debt[] {
  return tiles.flatMap((tile) => {
    const space = BOARD[tile];
    if (!isDeed(space) || !game.deeds[tile].mortgaged) return [];
    return [{ payer: debtor.id, creditor: null, amount: mortgageInterest(space), reason: `${space.name} mortgage interest`, mortgage: tile }];
  });
}

function draw(game: Game, deck: Deck, random: Random): void {
  const index = game.deck[deck].shift();
  requireRule(index !== undefined, "No cards are available.");
  const card = CARDS[deck][index];
  const player = current(game);
  game.card = { id: ++game.sequence, deck, index, player: player.id };
  log(game, `${player.name} drew ${card.title}. ${card.text}`, "card");
  const effect = card.effect;
  if (effect.kind !== "release") game.deck[deck].push(index);
  switch (effect.kind) {
    case "release":
      player.passes.push(deck);
      return afterLanding(game);
    case "holding":
      return goToHolding(game, player);
    case "advance":
      advance(game, player, (effect.tile - player.position + BOARD.length) % BOARD.length || BOARD.length);
      return land(game, random);
    case "nearest": {
      const steps = BOARD.findIndex((_, distance) => distance > 0 &&
        BOARD[(player.position + distance) % BOARD.length].type === effect.tileType);
      advance(game, player, steps);
      return land(game, random, effect.tileType === "rail" ? "doubleRail" : "specialUtility");
    }
    case "back":
      advance(game, player, -3);
      return land(game, random);
    case "cash":
      if (effect.amount < 0) {
        return queueBills(game, [{ payer: player.id, creditor: null, amount: -effect.amount, reason: card.title }], "landing", random);
      }
      player.cash += effect.amount;
      log(game, `${player.name} collected ${rupees(effect.amount)}.`, "money");
      return afterLanding(game);
    case "each":
      return queueBills(game, active(game).filter((other) => other.id !== player.id).map((other) => ({
        payer: effect.amount > 0 ? other.id : player.id, creditor: effect.amount > 0 ? player.id : other.id,
        amount: Math.abs(effect.amount), reason: card.title,
      })), "landing", random);
    case "repairs": {
      const amount = Object.values(game.deeds).filter((deed) => deed.owner === player.id).reduce(
        (total, deed) => total + (deed.level === 5 ? effect.hotel : deed.level * effect.house), 0);
      return queueBills(game, [{ payer: player.id, creditor: null, amount, reason: card.title }], "landing", random);
    }
  }
}

function land(game: Game, random: Random, special?: "doubleRail" | "specialUtility"): void {
  const player = current(game);
  const tile = player.position;
  const space = BOARD[tile];
  log(game, `${player.name} landed on ${space.name}.`, "move");
  if (isDeed(space)) {
    const deed = game.deeds[tile];
    if (!deed) {
      game.pendingDeed = tile;
      game.phase = "purchase";
      return;
    }
    if (deed.owner !== player.id && !deed.mortgaged) {
      const dice = special === "specialUtility" ? roll(random) : game.dice!;
      if (special === "specialUtility") log(game, `Utility roll: ${dice[0]} + ${dice[1]}.`, "move");
      const amount = landingRent(game, tile, sum(dice), special);
      return queueBills(game, [{ payer: player.id, creditor: deed.owner, amount, reason: `${space.name} rent` }], "landing", random);
    }
  } else if (space.type === "detour") {
    return goToHolding(game, player);
  } else if (space.type === "community" || space.type === "dispatch") {
    return draw(game, space.type, random);
  } else if (space.type === "tax") {
    return queueBills(game, [{ payer: player.id, creditor: null, amount: space.amount, reason: space.name }], "landing", random);
  }
  afterLanding(game);
}

function rollTurn(game: Game, player: Player, random: Random) {
  game.card = null;
  const dice = roll(random);
  const doubled = dice[0] === dice[1];
  game.dice = dice;
  log(game, `${player.name} rolled ${dice[0]} + ${dice[1]}.`, "move");
  if (player.jail !== null) {
    if (doubled) {
      player.jail = null;
      advance(game, player, sum(dice));
      return land(game, random);
    }
    player.jail++;
    if (player.jail < 3) {
      log(game, `${player.name} remains in Holding.`, "turn");
      return nextTurn(game);
    }
    return queueBills(game, [{ payer: player.id, creditor: null, amount: RELEASE_FEE, reason: "release from Holding" }], "jailMove", random);
  }
  game.doubles = doubled ? game.doubles + 1 : 0;
  if (game.doubles === 3) return goToHolding(game, player);
  game.extraRoll = doubled;
  advance(game, player, sum(dice));
  land(game, random);
}

function buy(game: Game, player: Player, tile: number, price: number) {
  player.cash -= price;
  game.deeds[tile] = { owner: player.id, level: 0, mortgaged: false };
  log(game, `${player.name} bought ${BOARD[tile].name} for ${rupees(price)}.`, "property");
}

function build(game: Game, player: Player, tile: number, price: number) {
  player.cash -= price;
  const level = ++game.deeds[tile].level;
  log(game, `${player.name} built a ${level === 5 ? "hotel" : "house"} on ${BOARD[tile].name} for ${rupees(price)}.`, "property");
}

function auctionName(item: AuctionItem) {
  return item.kind === "deed" ? BOARD[item.tile].name : `the bank’s last ${item.level}`;
}

function openAuction(game: Game, item: AuctionItem, eligible: Player[]) {
  game.phase = "auction";
  if (item.kind === "deed") game.pendingDeed = null;
  game.auction = { item, eligible: eligible.map((player) => player.id), bidder: eligible[0].id, highBid: 0, leader: null, leaderTile: null };
  log(game, `The bank opened bidding for ${auctionName(item)}.`, "property");
}

function openNextBankAuction(game: Game, random: Random) {
  if (game.auctionQueue.length > 0) {
    const tile = game.auctionQueue.shift()!;
    openAuction(game, { kind: "deed", tile }, active(game));
  } else if (game.auctionAfter === "landing") {
    afterLanding(game);
  } else if (game.auctionAfter === "nextTurn") {
    nextTurn(game);
  } else if (game.auctionAfter === "resumeDebts") {
    resolveBills(game, random);
  } else {
    game.phase = game.auctionAfter;
  }
}

function auctionStep(game: Game, player: Player, action: Extract<GameAction, { type: "bid" }> | { type: "passBid" }, random: Random) {
  const auction = game.auction!;
  const index = auction.eligible.indexOf(player.id);
  if (action.type === "passBid") {
    auction.eligible.splice(index, 1);
    log(game, `${player.name} passed on ${auctionName(auction.item)}.`, "property");
  } else {
    requireRule(Number.isSafeInteger(action.amount) && action.amount >= minimumBid(auction), `Bid at least ${rupees(minimumBid(auction))}.`);
    requireRule(action.amount <= player.cash, "You do not have enough cash for that bid.");
    if (auction.item.kind === "building") {
      const tile = action.tile;
      requireRule(tile !== undefined && !buildProblem(game, player, tile, true) &&
        (game.deeds[tile].level === 4 ? "hotel" : "house") === auction.item.level, "Choose a city eligible for this building.");
      auction.leaderTile = tile;
    }
    auction.highBid = action.amount;
    auction.leader = player.id;
    log(game, `${player.name} bid ${rupees(action.amount)} for ${auctionName(auction.item)}.`, "property");
  }
  const start = index + (action.type === "bid" ? 1 : 0);
  const order = [...auction.eligible.slice(start), ...auction.eligible.slice(0, start)];
  const next = order.find((id) => id !== auction.leader);
  if (next) {
    auction.bidder = next;
    return;
  }
  if (auction.leader) {
    const winner = find(game, auction.leader)!;
    if (auction.item.kind === "deed") buy(game, winner, auction.item.tile, auction.highBid);
    else build(game, winner, auction.leaderTile!, auction.highBid);
  } else {
    log(game, `The auction for ${auctionName(auction.item)} closed without a bid.`, "property");
  }
  game.auction = null;
  openNextBankAuction(game, random);
}

function bankrupt(game: Game, player: Player, debt: Debt, random: Random) {
  player.bankrupt = true;
  const creditor = debt.creditor ? find(game, debt.creditor) : undefined;
  const tiles = Object.keys(game.deeds).map(Number).filter((tile) => game.deeds[tile].owner === player.id);
  const buildingCash = tiles.reduce((total, tile) => total + game.deeds[tile].level * buildCost(tile) / 2, 0);
  if (creditor) {
    creditor.cash += player.cash + buildingCash;
    creditor.passes.push(...player.passes);
    for (const tile of tiles) game.deeds[tile] = { ...game.deeds[tile], owner: creditor.id, level: 0 };
  } else {
    for (const tile of tiles) delete game.deeds[tile];
    for (const pass of player.passes) returnPass(game, pass);
  }
  player.cash = 0;
  player.passes = [];
  game.debts.shift();
  if (game.trade?.from === player.id || game.trade?.to === player.id) game.trade = null;
  if (player.id === current(game).id) game.afterDebt = "nextTurn";
  log(game, `${player.name} went bankrupt${creditor ? ` and transferred their estate to ${creditor.name}` : ""}.`, "money");
  if (finishIfWon(game)) return;
  if (creditor) game.debts.unshift(...mortgageDues(game, tiles, creditor));
  if (!creditor && tiles.length > 0) {
    game.auctionQueue = tiles;
    game.auctionAfter = "resumeDebts";
    openNextBankAuction(game, random);
  } else {
    resolveBills(game, random);
  }
}

function returnPass(game: Game, deck: Deck) {
  game.deck[deck].push(CARDS[deck].findIndex((card) => card.effect.kind === "release"));
}

export function applyAction(original: Game, playerId: string, action: GameAction, random: Random): Game {
  const game = structuredClone(original);
  game.movement = null;
  const player = find(game, playerId);
  requireRule(player && !player.bankrupt && game.phase !== "finished", "This player can no longer take actions in the match.");
  const theirTurn = current(game).id === playerId;
  const debt = game.phase === "debt" ? game.debts[0] : undefined;
  const canInvest = investmentAllowed(game, playerId);
  switch (action.type) {
    case "roll":
      requireRule(theirTurn && (game.phase === "roll" || game.phase === "jail"), "Wait until it is your turn to roll.");
      rollTurn(game, player, random);
      break;
    case "buy":
    case "auction": {
      requireRule(theirTurn && game.phase === "purchase" && game.pendingDeed !== null, "There is no property waiting for your decision.");
      const tile = game.pendingDeed;
      const space = BOARD[tile];
      requireRule(isDeed(space) && !game.deeds[tile], "This property is unavailable.");
      if (action.type === "buy") {
        requireRule(player.cash >= space.price, "You cannot afford the asking price. Send the property to auction.");
        buy(game, player, tile, space.price);
        afterLanding(game);
      } else {
        game.auctionAfter = "landing";
        const order = [...game.players.slice(game.turn), ...game.players.slice(0, game.turn)];
        openAuction(game, { kind: "deed", tile }, order.filter((seat) => !seat.bankrupt));
      }
      break;
    }
    case "bid":
    case "passBid":
      requireRule(game.phase === "auction" && game.auction?.bidder === playerId, "Wait for your turn in the auction.");
      auctionStep(game, player, action, random);
      break;
    case "endTurn":
      requireRule(theirTurn && game.phase === "end", "Resolve the current turn before ending it.");
      nextTurn(game);
      break;
    case "payJail":
      requireRule(theirTurn && game.phase === "jail", "You can leave Holding on your own turn.");
      if (player.cash < RELEASE_FEE) {
        game.debts = [{ payer: player.id, creditor: null, amount: RELEASE_FEE, reason: "release from Holding" }];
        game.afterDebt = "roll";
        game.phase = "debt";
      } else {
        paid(game, { payer: player.id, creditor: null, amount: RELEASE_FEE, reason: "release from Holding" }, player);
        player.jail = null;
        game.phase = "roll";
      }
      break;
    case "usePass":
      requireRule(theirTurn && game.phase === "jail", "You can use a pass on your own turn in Holding.");
      requireRule(player.passes.includes(action.deck), "You do not have this release pass.");
      player.passes = player.passes.filter((pass) => pass !== action.deck);
      returnPass(game, action.deck);
      player.jail = null;
      game.phase = "roll";
      log(game, `${player.name} used a Release Pass.`, "card");
      break;
    case "payDebt":
      requireRule(debt?.payer === playerId && player.cash >= debt.amount, "You need enough cash to settle this bill.");
      paid(game, debt, player);
      game.debts.shift();
      if (game.afterDebt === "roll" && debt.reason === "release from Holding") player.jail = null;
      resolveBills(game, random);
      break;
    case "bankrupt":
      requireRule(debt?.payer === playerId, "You can only declare bankruptcy when you owe money.");
      requireRule(wealthIfLiquidated(game, player) < debt.amount, "You can cover this bill by raising cash. Sell buildings or mortgage properties first.");
      bankrupt(game, player, debt, random);
      break;
    case "mortgage":
    case "unmortgage":
    case "build":
    case "sell":
    case "sellGroup": {
      const tile = action.tile;
      const space = BOARD[tile];
      const deed = game.deeds[tile];
      requireRule(canInvest && isDeed(space) && deed?.owner === playerId, "Finish the current table decision before managing that property.");
      if (action.type === "mortgage") {
        const problem = mortgageProblem(game, player, tile);
        requireRule(!problem, problem ?? "");
        player.cash += mortgageValue(space);
        deed.mortgaged = true;
        log(game, `${player.name} mortgaged ${space.name} for ${rupees(mortgageValue(space))}.`, "property");
      } else if (action.type === "unmortgage") {
        requireRule(deed.mortgaged, "This property is not mortgaged.");
        requireRule(!debt || debt.mortgage === tile, "Settle the current bill before lifting other mortgages.");
        const cost = mortgageValue(space) + mortgageInterest(space);
        requireRule(player.cash >= cost, `You need ${rupees(cost)} to lift this mortgage.`);
        player.cash -= cost;
        deed.mortgaged = false;
        log(game, `${player.name} lifted the mortgage on ${space.name} for ${rupees(cost)}.`, "property");
        if (debt) {
          game.debts.shift();
          resolveBills(game, random);
        }
      } else if (action.type === "build") {
        requireRule(!debt, "Settle the current bill before buying buildings.");
        const problem = buildProblem(game, player, tile);
        requireRule(!problem, problem ?? "");
        const level = deed.level === 4 ? "hotel" : "house";
        const stock = bankStock(game);
        const competitors = (level === "hotel" ? stock.hotels : stock.houses) === 1
          ? active(game).filter((other) => other.cash >= MIN_BID && Object.keys(game.deeds).map(Number).some((index) =>
            (game.deeds[index].level === 4 ? "hotel" : "house") === level && !buildProblem(game, other, index, true)))
          : [];
        if (competitors.length > 1) {
          requireRule(game.phase === "roll" || game.phase === "jail" || game.phase === "end" || game.phase === "purchase", "Finish the current decision first.");
          game.auctionAfter = game.phase;
          openAuction(game, { kind: "building", level }, competitors);
        } else {
          build(game, player, tile, buildCost(tile));
        }
      } else if (action.type === "sell") {
        const problem = sellProblem(game, player, tile);
        requireRule(!problem, problem ?? "");
        const building = deed.level === 5 ? "hotel" : "house";
        deed.level--;
        player.cash += buildCost(tile) / 2;
        log(game, `${player.name} sold a ${building} on ${space.name} for ${rupees(buildCost(tile) / 2)}.`, "property");
      } else {
        requireRule(space.type === "city" && TIER_DEEDS[space.tier].some((index) => game.deeds[index]?.level > 0), "There are no buildings in this set to sell.");
        let amount = 0;
        for (const index of TIER_DEEDS[space.tier]) {
          const property = game.deeds[index];
          if (property?.owner === playerId) {
            amount += property.level * buildCost(index) / 2;
            property.level = 0;
          }
        }
        player.cash += amount;
        log(game, `${player.name} sold all buildings in the ${MARKET_TIERS[space.tier].name} set for ${rupees(amount)}.`, "property");
      }
      break;
    }
    case "offerTrade": {
      requireRule(canInvest && !(game.trade && game.trade.from !== playerId), "Finish the current trade before making a new offer.");
      const recipient = find(game, action.to);
      requireRule(recipient && recipient.id !== playerId && !recipient.bankrupt, "Choose a player who is still in the game.");
      const { give, want } = action;
      requireRule(give.cash || want.cash || give.deeds.length || want.deeds.length || give.passes.length || want.passes.length, "Add something to the trade.");
      const problem = tradeProblem(game, player, give) ?? tradeProblem(game, recipient, want);
      requireRule(!problem, problem ?? "");
      game.trade = { id: `trade-${++game.sequence}`, from: playerId, to: recipient.id, give, want };
      log(game, `${player.name} offered a trade to ${recipient.name}.`, "property");
      break;
    }
    case "acceptTrade":
    case "declineTrade":
    case "cancelTrade": {
      const trade = game.trade;
      requireRule(trade && trade.id === action.tradeId && (action.type === "cancelTrade" ? trade.from : trade.to) === playerId, "This offer is no longer available to you.");
      if (action.type === "acceptTrade") {
        requireRule(game.phase !== "auction", "Finish the auction before accepting a trade.");
        const from = find(game, trade.from)!;
        const to = find(game, trade.to)!;
        const problem = tradeProblem(game, from, trade.give) ?? tradeProblem(game, to, trade.want);
        requireRule(!problem, problem ?? "");
        const dues = [...mortgageDues(game, trade.give.deeds, to), ...mortgageDues(game, trade.want.deeds, from)];
        requireRule(!debt || dues.length === 0, "Trade unmortgaged properties while a bill is open.");
        from.cash += trade.want.cash - trade.give.cash;
        to.cash += trade.give.cash - trade.want.cash;
        for (const tile of trade.give.deeds) game.deeds[tile].owner = to.id;
        for (const tile of trade.want.deeds) game.deeds[tile].owner = from.id;
        from.passes = [...from.passes.filter((pass) => !trade.give.passes.includes(pass)), ...trade.want.passes];
        to.passes = [...to.passes.filter((pass) => !trade.want.passes.includes(pass)), ...trade.give.passes];
        log(game, `${from.name} and ${to.name} completed a trade.`, "property");
        if (dues.length) {
          requireRule(game.phase === "roll" || game.phase === "jail" || game.phase === "end" || game.phase === "purchase", "Finish the current decision before completing this trade.");
          queueBills(game, dues, game.phase, random);
        }
      } else {
        log(game, `${player.name} ${action.type === "cancelTrade" ? "withdrew" : "declined"} the trade offer.`, "property");
      }
      game.trade = null;
      break;
    }
  }
  return game;
}
