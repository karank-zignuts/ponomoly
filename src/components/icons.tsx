import {
  ArrowRightFromLine, Bike, BusFront, Camera, CarTaxiFront, Coffee, Droplets, Landmark,
  LockKeyhole, MailOpen, Navigation2, Sailboat, ShipWheel, Ticket, TrainFront, Zap,
} from "lucide-react";
import { TOKENS, type Space } from "@/game/board";

const tokenIcons = [CarTaxiFront, Sailboat, BusFront, Bike, Navigation2, Camera];

export function Token({ index, className = "" }: { index: number; className?: string }) {
  const Icon = tokenIcons[index] ?? CarTaxiFront;
  return <span aria-hidden="true" className={`token ${className}`} style={{ "--token-color": TOKENS[index]?.color } as React.CSSProperties}>
    <Icon size="1em" strokeWidth={2.3} />
  </span>;
}

export function SpaceIcon({ space, size = 20 }: { space: Space; size?: number }) {
  const Icon = {
    departure: ArrowRightFromLine, jail: LockKeyhole, rest: Coffee, detour: Navigation2, tax: Landmark,
    dispatch: Ticket, community: MailOpen, rail: TrainFront,
    utility: space.name === "Water Works" ? Droplets : Zap, city: ShipWheel,
  }[space.type];
  return <Icon aria-hidden="true" size={size} strokeWidth={1.8} />;
}
