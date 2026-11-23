import type { Deck } from "./cards";

export type Player = {
  id: string;
  name: string;
  token: number;
  cash: number;
  position: number;
  jail: number | null;
  bankrupt: boolean;
  passes: Deck[];
};

export type Ownership = { owner: string; level: number; mortgaged: boolean };
export type Debt = { payer: string; creditor: string | null; amount: number; reason: string; mortgage?: number };
export type TradeSide = { cash: number; deeds: number[]; passes: Deck[] };
export type Trade = { id: string; from: string; to: string; give: TradeSide; want: TradeSide };
export type AuctionItem = { kind: "deed"; tile: number } | { kind: "building"; level: "house" | "hotel" };
export type Auction = {
  item: AuctionItem;
  bidder: string;
  eligible: string[];
  highBid: number;
  leader: string | null;
  leaderTile: number | null;
};
export type Phase = "roll" | "jail" | "purchase" | "auction" | "debt" | "end" | "finished";
export type Activity = { id: number; text: string; kind: "turn" | "money" | "move" | "property" | "card" | "system" };
export type Movement = { id: number; player: string; path: number[]; teleport: boolean };
export type DrawnCard = { id: number; deck: Deck; index: number; player: string };
export type PhaseAfterDebt = "roll" | "jail" | "end" | "purchase" | "landing" | "jailMove" | "nextTurn";

export type Game = {
  players: Player[];
  turn: number;
  round: number;
  phase: Phase;
  deeds: Record<number, Ownership>;
  dice: [number, number] | null;
  doubles: number;
  extraRoll: boolean;
  pendingDeed: number | null;
  auction: Auction | null;
  auctionQueue: number[];
  auctionAfter: Exclude<PhaseAfterDebt, "jailMove"> | "resumeDebts";
  debts: Debt[];
  afterDebt: PhaseAfterDebt;
  trade: Trade | null;
  winner: string | null;
  activity: Activity[];
  sequence: number;
  movement: Movement | null;
  card: DrawnCard | null;
  deck: Record<Deck, number[]>;

};

export type PublicGame = Omit<Game, "deck" | "auctionQueue" | "auctionAfter" | "afterDebt">;

type TypeOnly<T extends string> = { [Key in T]: { type: Key } }[T];

export type GameAction =
  | TypeOnly<"roll" | "buy" | "auction" | "passBid" | "endTurn" | "payJail" | "payDebt" | "bankrupt">
  | { type: "usePass"; deck: Deck }
  | { type: "bid"; amount: number; tile?: number }
  | { type: "mortgage" | "unmortgage" | "build" | "sell" | "sellGroup"; tile: number }
  | { type: "offerTrade"; to: string; give: TradeSide; want: TradeSide }
  | { type: "acceptTrade" | "declineTrade" | "cancelTrade"; tradeId: string };

export type RoomAction = GameAction | TypeOnly<"start" | "leaveLobby" | "addBot"> | { type: "chooseToken"; token: number } | { type: "removeBot"; player: string };
export type Seat = { id: string; name: string; token: number; online: boolean; bot?: true };
export type RoomView = {
  code: string;
  revision: number;
  me: string;
  host: string;
  seats: Seat[];
  game: PublicGame | null;
  botReadyAt: number | null;
  realtime: { topic: string; url: string; key: string } | null;
};
