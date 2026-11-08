import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Familjeaktiviteter",
    short_name: "Familj",
    description: "Aktiviteter för barnfamiljer efter ålder, restid och budget.",
    lang: "sv",
    start_url: "/",
    display: "standalone",
    background_color: "#FBF7F6",
    theme_color: "#FBF7F6",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
