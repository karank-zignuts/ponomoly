import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Ponomoly · India Edition",
    short_name: "Ponomoly",
    description: "An India-wide property trading game for friends.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7f0de",
    theme_color: "#f7f0de",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
