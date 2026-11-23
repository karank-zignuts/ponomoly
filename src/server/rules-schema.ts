import { z } from "zod";
import type { RoomAction } from "@/game/types";

const actionOnly = <T extends string>(type: T) => z.object({ type: z.literal(type) });
const tile = z.number().int().min(0).max(39);
const deck = z.enum(["dispatch", "community"]);
const tradeId = z.string().regex(/^trade-[1-9]\d*$/);
const tradeSide = z.object({
  cash: z.number().int().min(0).max(10_000_000),
  deeds: z.array(tile).max(28).refine((value) => new Set(value).size === value.length, "Duplicate deeds"),
  passes: z.array(deck).max(2).refine((value) => new Set(value).size === value.length, "Duplicate passes"),
});
const prop = <T extends string>(type: T) => z.object({ type: z.literal(type), tile });
const tradeResponse = <T extends string>(type: T) => z.object({ type: z.literal(type), tradeId });

export const actionSchema: z.ZodType<RoomAction> = z.discriminatedUnion("type", [
  actionOnly("start"), actionOnly("leaveLobby"), actionOnly("addBot"),
  z.object({ type: z.literal("removeBot"), player: z.uuid() }), actionOnly("roll"), actionOnly("buy"),
  actionOnly("auction"), actionOnly("passBid"), actionOnly("endTurn"), actionOnly("payJail"),
  actionOnly("payDebt"), actionOnly("bankrupt"),
  z.object({ type: z.literal("chooseToken"), token: z.number().int().min(0).max(5) }),
  z.object({ type: z.literal("usePass"), deck }),
  z.object({ type: z.literal("bid"), amount: z.number().int().min(1).max(10_000_000), tile: tile.optional() }),
  prop("mortgage"), prop("unmortgage"), prop("build"), prop("sell"), prop("sellGroup"),
  z.object({ type: z.literal("offerTrade"), to: z.uuid(), give: tradeSide, want: tradeSide }),
  tradeResponse("acceptTrade"), tradeResponse("declineTrade"), tradeResponse("cancelTrade"),
]);

export const profileSchema = z.object({
  name: z.string().trim().min(2).max(22).regex(/^[\p{L}\p{M}\p{N} ._'’\-]+$/u),
  token: z.number().int().min(0).max(5),
});
