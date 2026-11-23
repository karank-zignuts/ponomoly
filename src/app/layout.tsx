import type { Metadata, Viewport } from "next";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/dm-sans";
import "./styles.css";

export const metadata: Metadata = {
  title: { default: "Ponomoly · India Edition", template: "%s · Ponomoly" },
  description: "An India-wide property trading game. Invite friends, roll the dice, and complete colour sets.",
  applicationName: "Ponomoly",
  appleWebApp: { capable: true, title: "Ponomoly", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch.png" },
};

export const viewport: Viewport = { themeColor: "#f7f0de", colorScheme: "light" };

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
