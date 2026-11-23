import { describe, expect, it } from "vitest";
import { BOARD, CITY_MARKETS, DEPARTURE_PAY, isDeed, JAIL_INDEX, mortgageInterest, RELEASE_FEE, STARTING_CASH, TIER_DEEDS } from "@/game/board";
import { CARDS } from "@/game/cards";
import { chooseBotAction, nextBot } from "@/game/bot";
import { bankStock, landingRent } from "@/game/economy";
import { applyAction, createGame, publicGame, RuleError } from "@/game/engine";
import type { Game, GameAction } from "@/game/types";

const seats = [
  { id: "asha", name: "Asha", token: 0 },
  { id: "kabir", name: "Kabir", token: 1 },
  { id: "meera", name: "Meera", token: 2 },
];
const deterministic = (max: number) => max - 1;
const fixture = (size = 3) => createGame(seats.slice(0, size), deterministic);
const actor = (game: Game) => game.players[game.turn];
const seat = (game: Game, id: string) => game.players.find((player) => player.id === id)!;
const step = (game: Game, type: GameAction, id = actor(game).id) => applyAction(game, id, type, deterministic);
function rolled(game: Game, values: number[]) {
  let index = 0;
  return applyAction(game, actor(game).id, { type: "roll" }, () => (values[index++] ?? 3) - 1);
}

describe("India board economy", () => {
  it("contains whole cities and ranks prices with NHB valuations", () => {
    expect(BOARD).toHaveLength(40);
    expect(BOARD.filter(isDeed)).toHaveLength(28);
    expect(new Set(CITY_MARKETS.map((city) => city.name)).size).toBe(22);
    expect(CITY_MARKETS.map((city) => city.name)).toEqual(expect.arrayContaining(["Ahmedabad", "Mumbai", "Bengaluru", "Delhi", "Chennai", "Kolkata", "Hyderabad", "Pune"]));
    expect(CITY_MARKETS.at(-1)?.name).toBe("Mumbai");
    let previous = { market: 0, price: 0 };
    for (const city of CITY_MARKETS) {
      expect(city.market).toBeGreaterThan(previous.market);
      expect(city.price).toBeGreaterThan(previous.price);
      expect(city.rents).toHaveLength(6);
      expect([...city.rents].sort((a, b) => a - b)).toEqual(city.rents);
      previous = city;
    }
    expect(TIER_DEEDS.map((group) => group.length)).toEqual([2, 3, 3, 3, 3, 3, 3, 2]);
  });

  it("uses full-set rent, rail and utility multipliers, while honoring mortgages", () => {
    const game = fixture();
    for (const tile of [1, 3, 5, 15, 12, 27]) game.deeds[tile] = { owner: "asha", mortgaged: false, level: 0 };
    expect(landingRent(game, 1, 8)).toBe(60);
    expect(landingRent(game, 5, 8)).toBe(500);
    expect(landingRent(game, 5, 8, "doubleRail")).toBe(1000);
    expect(landingRent(game, 12, 8)).toBe(800);
    game.deeds[15].mortgaged = true;
    game.deeds[27].mortgaged = true;
    expect(landingRent(game, 5, 8)).toBe(500);
    expect(landingRent(game, 12, 8)).toBe(800);
    expect(landingRent(game, 27, 8)).toBe(0);
  });
});

describe("turns and cards", () => {
  it("sets order with an opening roll and keeps deck order private", () => {
    const values = [2, 1, 3, 3, 5, 5, 1, 1];
    const game = createGame(seats, (max) => values.shift() ?? (max - 1));
    expect(actor(game).id).toBe("kabir");
    expect(game.players.map((player) => player.id)).toEqual(["kabir", "meera", "asha"]);
    expect(game.players.every((player) => player.cash === STARTING_CASH)).toBe(true);
    expect(publicGame(game)).not.toHaveProperty("deck");
  });

  it("pays for crossing Departure and returns a used release pass to its deck", () => {
    const game = fixture();
    actor(game).position = 38;
    game.deck.community.unshift(game.deck.community.splice(4, 1)[0]);
    const drawn = rolled(game, [2, 2]);
    expect(actor(drawn).position).toBe(2);
    expect(actor(drawn).cash).toBe(STARTING_CASH + DEPARTURE_PAY);
    expect(actor(drawn).passes).toEqual(["community"]);
    expect(drawn.deck.community).not.toContain(4);
    expect(drawn.phase).toBe("roll");
    actor(drawn).position = JAIL_INDEX;
    actor(drawn).jail = 0;
    drawn.phase = "jail";
    const released = step(drawn, { type: "usePass", deck: "community" });
    expect(released.deck.community.at(-1)).toBe(4);
    expect(actor(released).jail).toBeNull();
  });

  it("draws a themed movement card and resolves the new landing in the same action", () => {
    const game = fixture();
    actor(game).position = 6;
    const top = CARDS.dispatch.findIndex((card) => card.title === "A View of the Bay");
    game.deck.dispatch = [top, ...game.deck.dispatch.filter((index) => index !== top)];
    const next = rolled(game, [1, 1]);
    expect(next.pendingDeed).toBe(39);
    expect(next.movement?.path.at(-1)).toBe(39);
    expect(next.card?.index).toBe(top);
    expect(next.deck.dispatch.at(-1)).toBe(top);
  });

  it("sends the player straight to Holding on the third double without moving", () => {
    const game = fixture();
    actor(game).position = 34;
    game.doubles = 2;
    const id = actor(game).id;
    const next = rolled(game, [6, 6]);
    expect(seat(next, id)).toMatchObject({ position: JAIL_INDEX, jail: 0, cash: STARTING_CASH });
    expect(next.movement?.teleport).toBe(true);
    expect(actor(next).id).not.toBe(id);
  });

  it("requires bail after three failed releases and uses the final dice total", () => {
    const game = fixture();
    const player = actor(game);
    player.position = JAIL_INDEX;
    player.cash = 300;
    player.jail = 2;
    game.phase = "jail";
    game.deeds[1] = { owner: player.id, level: 0, mortgaged: false };
    let next = rolled(game, [1, 2]);
    expect(next.phase).toBe("debt");
    expect(next.debts[0].amount).toBe(RELEASE_FEE);
    next = step(next, { type: "mortgage", tile: 1 });
    next = step(next, { type: "payDebt" });
    expect(actor(next)).toMatchObject({ jail: null, position: 13, cash: 100 });
    expect(next.pendingDeed).toBe(13);
  });

  it("leaves Holding on doubles without a bonus roll", () => {
    const game = fixture();
    actor(game).position = JAIL_INDEX;
    actor(game).jail = 0;
    game.phase = "jail";
    const next = rolled(game, [1, 1]);
    expect(actor(next).jail).toBeNull();
    expect(next.extraRoll).toBe(false);
    expect(next.pendingDeed).toBe(12);
  });
});

describe("auctions and building", () => {
  it("lets the decliner bid, handles passes in rotation, and charges the winner exactly once", () => {
    let game = fixture();
    const buyer = actor(game).id;
    game = rolled(game, [2, 3]);
    game = step(game, { type: "auction" });
    expect(game.auction?.bidder).toBe(buyer);
    game = step(game, { type: "bid", amount: 100 }, buyer);
    game = step(game, { type: "bid", amount: 200 }, "kabir");
    expect(() => step(game, { type: "bid", amount: 201 }, "meera")).toThrow(RuleError);
    game = step(game, { type: "passBid" }, "meera");
    game = step(game, { type: "passBid" }, buyer);
    expect(game.deeds[5].owner).toBe("kabir");
    expect(seat(game, "kabir").cash).toBe(STARTING_CASH - 200);
    expect(game.phase).toBe("end");
  });

  it("leaves a deed in the bank when nobody bids", () => {
    let game = rolled(fixture(2), [2, 3]);
    game = step(game, { type: "auction" });
    for (const id of ["asha", "kabir"]) game = step(game, { type: "passBid" }, id);
    expect(game.deeds[5]).toBeUndefined();
    expect(game.phase).toBe("end");
  });

  it("allows building off-turn, enforces even development and refunds buildings to the bank", () => {
    let game = fixture();
    for (const tile of [1, 3]) game.deeds[tile] = { owner: "kabir", mortgaged: false, level: 0 };
    game = step(game, { type: "build", tile: 1 }, "kabir");
    expect(() => step(game, { type: "build", tile: 1 }, "kabir")).toThrow("least developed");
    expect(() => step(game, { type: "mortgage", tile: 1 }, "kabir")).toThrow("Sell all buildings");
    game = step(game, { type: "build", tile: 3 }, "kabir");
    expect(bankStock(game).houses).toBe(30);
    game = step(game, { type: "sellGroup", tile: 1 }, "kabir");
    expect(bankStock(game).houses).toBe(32);
    expect(seat(game, "kabir").cash).toBe(STARTING_CASH - 500);
  });

  it("auctions the last stock when several owners can use it and resumes the buying decision", () => {
    let game = fixture();
    TIER_DEEDS[0].forEach((tile) => { game.deeds[tile] = { owner: "asha", mortgaged: false, level: 0 }; });
    TIER_DEEDS[1].forEach((tile) => { game.deeds[tile] = { owner: "kabir", mortgaged: false, level: 1 }; });
    [...TIER_DEEDS[2], ...TIER_DEEDS[3], ...TIER_DEEDS[4]].forEach((tile, index) => {
      game.deeds[tile] = { owner: "meera", mortgaged: false, level: index < 8 ? 3 : 4 };
    });
    game.pendingDeed = 5;
    game.phase = "purchase";
    expect(bankStock(game).houses).toBe(1);
    game = step(game, { type: "build", tile: 1 }, "asha");
    expect(game.auction?.item).toEqual({ kind: "building", level: "house" });
    while (game.phase === "auction") {
      const bidder = game.auction!.bidder;
      game = step(game, bidder === "kabir" ? { type: "bid", amount: 400, tile: 6 } : { type: "passBid" }, bidder);
    }
    expect(game.phase).toBe("purchase");
    expect(game.pendingDeed).toBe(5);
    expect(game.deeds[6].level).toBe(2);
    expect(bankStock(game).houses).toBe(0);
  });
});

describe("financial settlements", () => {
  it("trades cash for a mortgaged deed and offers immediate clearance or interest", () => {
    let game = fixture();
    game.deeds[1] = { owner: "kabir", mortgaged: false, level: 0 };
    game = step(game, { type: "mortgage", tile: 1 }, "kabir");
    game = step(game, {
      type: "offerTrade", to: "kabir", give: { cash: 500, deeds: [], passes: [] },
      want: { cash: 0, deeds: [1], passes: [] },
    }, "asha");
    game = step(game, { type: "acceptTrade", tradeId: game.trade!.id }, "kabir");
    const deed = BOARD[1];
    expect(game.deeds[1]).toMatchObject({ owner: "asha", mortgaged: true });
    expect(game.debts[0].amount).toBe(mortgageInterest(deed as Parameters<typeof mortgageInterest>[0]));
    game = step(game, { type: "unmortgage", tile: 1 }, "asha");
    expect(game.deeds[1].mortgaged).toBe(false);
    expect(game.phase).toBe("roll");
    expect(seat(game, "asha").cash).toBe(STARTING_CASH - 500 - 330);
  });

  it("transfers a bankrupt estate and only then declares the winner", () => {
    let game = fixture(2);
    const debtor = actor(game);
    debtor.cash = 100;
    debtor.position = 33;
    game.deeds[1] = { owner: debtor.id, mortgaged: false, level: 0 };
    game.deeds[39] = { owner: "kabir", mortgaged: false, level: 0 };
    game = rolled(game, [2, 4]);
    expect(game.phase).toBe("debt");
    game = step(game, { type: "bankrupt" });
    expect(game.phase).toBe("finished");
    expect(game.winner).toBe("kabir");
    expect(game.deeds[1].owner).toBe("kabir");
    expect(seat(game, "kabir").cash).toBe(STARTING_CASH + 100);
  });

  it("clears bankrupt-to-bank mortgages and auctions all returned deeds before play resumes", () => {
    let game = fixture();
    actor(game).cash = 10;
    game.deeds[1] = { owner: "asha", mortgaged: true, level: 0 };
    game.deeds[3] = { owner: "asha", mortgaged: false, level: 0 };
    game = rolled(game, [2, 2]);
    game = step(game, { type: "bankrupt" });
    expect(game.phase).toBe("auction");
    expect(game.auction?.item).toEqual({ kind: "deed", tile: 1 });
    game = step(game, { type: "bid", amount: 100 }, "kabir");
    game = step(game, { type: "passBid" }, "meera");
    expect(game.deeds[1]).toEqual({ owner: "kabir", level: 0, mortgaged: false });
    expect(game.auction?.item).toEqual({ kind: "deed", tile: 3 });
    game = step(game, { type: "passBid" }, "kabir");
    game = step(game, { type: "bid", amount: 100 }, "meera");
    expect(game.deeds[3].owner).toBe("meera");
    expect(actor(game).id).toBe("kabir");
  });

  it("rejects an out-of-turn roll without mutating the supplied state", () => {
    const game = fixture();
    const original = JSON.stringify(game);
    expect(() => step(game, { type: "roll" }, "kabir")).toThrow(RuleError);
    expect(JSON.stringify(game)).toBe(original);
  });
});

function seeded(seed: number) {
  let state = seed >>> 0;
  return (max: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state >>> 8) % max;
  };
}

describe("bot tactics and full matches", () => {
  it("secures a full set when affordable, but protects cash when buying a lone title", () => {
    const game = fixture();
    game.phase = "purchase";
    game.pendingDeed = 39;
    actor(game).cash = 4700;
    actor(game).position = 20;
    expect(chooseBotAction(game, actor(game).id, false)).toEqual({ type: "auction" });
    game.deeds[36] = { owner: actor(game).id, mortgaged: false, level: 0 };
    expect(chooseBotAction(game, actor(game).id, false)).toEqual({ type: "buy" });
  });

  it("rejects trades that gift an opponent a full set at a poor price", () => {
    const game = fixture();
    game.deeds[1] = { owner: "asha", mortgaged: false, level: 0 };
    game.deeds[3] = { owner: "kabir", mortgaged: false, level: 0 };
    game.trade = { id: "trade-1", from: "asha", to: "kabir", give: { cash: 900, deeds: [], passes: [] }, want: { cash: 0, deeds: [3], passes: [] } };
    expect(chooseBotAction(game, "kabir", false)).toEqual({ type: "declineTrade", tradeId: "trade-1" });
    game.trade.give.cash = 2500;
    expect(chooseBotAction(game, "kabir", false)).toEqual({ type: "acceptTrade", tradeId: "trade-1" });
  });

  it.each([8, 23, 75, 122])("finishes a seeded full match without invalid bot decisions (seed %i)", (seed) => {
    const random = seeded(seed);
    let game = createGame(seats, random);
    const bots = new Set(seats.map((player) => player.id));
    const traded = new Map<string, number>();
    for (let iteration = 0; iteration < 4500 && game.phase !== "finished"; iteration++) {
      const id = nextBot(game, bots)!;
      const action = chooseBotAction(game, id, traded.get(id) === game.round);
      if (action.type === "offerTrade") traded.set(id, game.round);
      game = applyAction(game, id, action, random);
      const stock = bankStock(game);
      if (stock.houses < 0 || stock.hotels < 0 || game.players.some((player) => player.cash < 0)) throw new Error("Economy invariant violated.");
    }
    expect(game.phase).toBe("finished");
    expect(game.winner).toBeTruthy();
  });
});
