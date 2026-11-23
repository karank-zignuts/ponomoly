import type { Metadata } from "next";
import { Room } from "@/components/room";

export const metadata: Metadata = { title: "Private room", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code.toUpperCase();
  return <Room key={code} code={code} />;
}
