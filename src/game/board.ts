export const STARTING_CASH = 15_000;
export const DEPARTURE_PAY = 2_000;
export const RELEASE_FEE = 500;
export const MIN_BID = 100;
export const BID_INCREMENT = 10;
export const MAX_PLAYERS = 6;
export const JAIL_INDEX = 10;
export const HOUSE_SUPPLY = 32;
export const HOTEL_SUPPLY = 12;

export const rupees = new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 0,
}).format;

export const MARKET_TIERS = [
  { name: "Copper", color: "#96634d", build: 500 },
  { name: "Sky", color: "#79a7b2", build: 600 },
  { name: "Orchid", color: "#ba7198", build: 900 },
  { name: "Amber", color: "#d48247", build: 1000 },
  { name: "Coral", color: "#c6554a", build: 1300 },
  { name: "Gold", color: "#d2a33a", build: 1500 },
  { name: "Jade", color: "#438873", build: 1700 },
  { name: "Indigo", color: "#496b9c", build: 2000 },
] as const;

export type City = {
  type: "city"; name: string; compact: string; tier: number; market: number; price: number; rents: readonly number[];
};
export type Transit = { type: "rail" | "utility"; name: string; price: number };
type PublicSpace =
  | { type: "departure" | "jail" | "rest" | "detour"; name: string }
  | { type: "tax"; name: string; amount: number }
  | { type: "dispatch" | "community"; name: string };
export type Space = City | Transit | PublicSpace;
export type Deed = City | Transit;

function city(tier: number, name: string, market: number, price: number, baseRent: number, compact = name): City {
  const rents = [baseRent, ...[5, 14, 31, 41, 51].map((factor) => {
    const rental = baseRent * factor + MARKET_TIERS[tier].build * (factor >= 31 ? .6 : .15);
    return Math.round(rental / 50) * 50;
  })];
  return { type: "city", tier, name, compact, market, price, rents };
}

export const BOARD: readonly Space[] = [
  { type: "departure", name: "Departure" },
  city(0, "Bhopal", 4703, 600, 30),
  { type: "community", name: "City Post" },
  city(0, "Indore", 5037, 800, 50),
  { type: "tax", name: "Civic Tax", amount: 2000 },
  { type: "rail", name: "Western Rail", price: 2000 },
  city(1, "Vadodara", 5265, 1000, 60),
  city(1, "Jaipur", 5409, 1100, 70),
  { type: "dispatch", name: "Journey" },
  city(1, "Visakhapatnam", 6103, 1200, 80, "Vizag"),
  { type: "jail", name: "Holding Cell" },
  city(2, "Surat", 6392, 1300, 90),
  { type: "utility", name: "Power Grid", price: 1500 },
  city(2, "Guwahati", 6503, 1400, 100),
  city(2, "Lucknow", 6599, 1500, 110),
  { type: "rail", name: "Southern Rail", price: 2000 },
  city(3, "Patna", 7220, 1600, 120),
  { type: "community", name: "City Post" },
  city(3, "Nagpur", 7342, 1700, 130),
  city(3, "Coimbatore", 7697, 1800, 140),
  { type: "rest", name: "Rest Stop" },
  { type: "dispatch", name: "Journey" },
  city(4, "Chandigarh", 7781, 1900, 150),
  city(4, "Ahmedabad", 8118, 2000, 160),
  city(4, "Thiruvananthapuram", 8183, 2100, 170, "Trivandrum"),
  { type: "rail", name: "Deccan Rail", price: 2000 },
  city(5, "Hyderabad", 8538, 2200, 180),
  { type: "utility", name: "Water Works", price: 1500 },
  city(5, "Kolkata", 8571, 2300, 195),
  city(5, "Kochi", 9191, 2400, 210),
  { type: "detour", name: "Go to Holding" },
  city(6, "Delhi", 9584, 2500, 225),
  { type: "community", name: "City Post" },
  city(6, "Pune", 10561, 2700, 245),
  city(6, "Chennai", 10586, 2900, 260),
  { type: "rail", name: "Northern Rail", price: 2000 },
  city(7, "Bengaluru", 12526, 3500, 340),
  { type: "dispatch", name: "Journey" },
  { type: "tax", name: "Luxury Levy", amount: 1000 },
  city(7, "Mumbai", 28683, 4000, 470),
];

export const TIER_DEEDS = MARKET_TIERS.map((_, tier) =>
  BOARD.flatMap((space, index) => space.type === "city" && space.tier === tier ? [index] : []),
);

export const CITY_MARKETS = BOARD.filter((space): space is City => space.type === "city");

export function isDeed(space: Space | undefined): space is Deed {
  return space?.type === "city" || space?.type === "rail" || space?.type === "utility";
}

export function mortgageValue(deed: Deed) {
  return Math.floor(deed.price / 2);
}

export function mortgageInterest(deed: Deed) {
  return Math.ceil(mortgageValue(deed) / 10);
}

export const TOKENS = [
  { name: "Taxi", color: "#a15c17", icon: "taxi" },
  { name: "Ferry", color: "#226b79", icon: "ferry" },
  { name: "Bus", color: "#ac493c", icon: "bus" },
  { name: "Bicycle", color: "#46745a", icon: "bike" },
  { name: "Kite", color: "#754c88", icon: "kite" },
  { name: "Camera", color: "#495d90", icon: "camera" },
] as const;
