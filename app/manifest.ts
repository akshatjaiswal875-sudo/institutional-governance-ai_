import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GovAI — Institutional Governance OS",
    short_name: "GovAI",
    description: "AI-powered institutional governance platform for meetings, events, policies, decisions and action items.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#050816",
    theme_color: "#06131b",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any maskable",
      },
    ],
  };
}
