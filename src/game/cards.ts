import { DEPARTURE_PAY, rupees } from "./board";

export type Deck = "dispatch" | "community";
type Effect =
  | { kind: "cash" | "each"; amount: number }
  | { kind: "advance"; tile: number }
  | { kind: "nearest"; tileType: "rail" | "utility" }
  | { kind: "repairs"; house: number; hotel: number }
  | { kind: "holding" | "release" | "back" };

type Card = { title: string; text: string; effect: Effect };
const cash = (title: string, amount: number): Card => ({
  title, text: `${amount > 0 ? "Collect" : "Pay"} ${rupees(Math.abs(amount))}.`, effect: { kind: "cash", amount },
});
const move = (title: string, place: string, tile: number): Card => ({
  title, text: `Advance to ${place}. Collect ${rupees(DEPARTURE_PAY)} if you cross Departure.`,
  effect: { kind: "advance", tile },
});
const release: Card = {
  title: "Release Pass", text: "Keep this card. Use it to leave Holding or include it in a trade.",
  effect: { kind: "release" },
};
const holding: Card = {
  title: "Route Suspended", text: "Go directly to Holding. Your turn ends without a departure payment.",
  effect: { kind: "holding" },
};
const nextRail: Card = {
  title: "Rail Connection", text: "Advance to the next railway. If owned by another player, pay twice its normal rent.",
  effect: { kind: "nearest", tileType: "rail" },
};
const repairs = (title: string, house: number, hotel: number): Card => ({
  title, text: `Pay ${rupees(house)} per house and ${rupees(hotel)} per hotel you own.`,
  effect: { kind: "repairs", house, hotel },
});
const each = (title: string, amount: number): Card => ({
  title, text: `${amount > 0 ? "Collect from" : "Pay"} each other player ${rupees(Math.abs(amount))}.`,
  effect: { kind: "each", amount },
});

export const CARDS: Record<Deck, readonly Card[]> = {
  dispatch: [
    move("First Train Out", "Departure", 0),
    move("A View of the Bay", "Mumbai", 39),
    move("A Weekend Away", "Thiruvananthapuram", 24),
    move("A Stop in Gujarat", "Surat", 11),
    nextRail,
    { ...nextRail, title: "Change at the Junction" },
    { title: "Infrastructure Visit", text: "Advance to the next utility. If another player owns it, roll both dice and pay ₹100 times the total.", effect: { kind: "nearest", tileType: "utility" } },
    cash("Bond Payout", 500),
    release,
    { title: "Missed Your Stop", text: "Move back three spaces and resolve the space you land on.", effect: { kind: "back" } },
    holding,
    repairs("Monsoon Maintenance", 250, 1000),
    cash("Transit Fine", -150),
    move("Western Express", "Western Rail", 5),
    each("Host the Reunion", -500),
    cash("Maturing Investment", 1500),
  ],
  community: [
    move("Homeward Bound", "Departure", 0),
    cash("Bank Adjustment", 2000),
    cash("Clinic Bill", -500),
    cash("Co-op Dividend", 500),
    release,
    holding,
    cash("Festival Prize", 1000),
    cash("Tax Refund", 200),
    each("Birthday Collection", 100),
    cash("Savings Mature", 1000),
    cash("Hospital Invoice", -1000),
    cash("Tuition Due", -500),
    cash("Consulting Fee", 250),
    repairs("Neighbourhood Upkeep", 400, 1150),
    cash("Photo Contest", 100),
    cash("Family Bequest", 1000),
  ],
};
