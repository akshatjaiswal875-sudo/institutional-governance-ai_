import type { Metadata } from "next";
import { ReactNode } from "react";
import { Nav } from "@/components/nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "GovAI — Institutional Governance OS",
  description: "AI-powered institutional governance platform for meetings, events, policies, decisions and action items.",
  applicationName: "GovAI",
  themeColor: "#06131b",
  appleWebApp: {
    capable: true,
    title: "GovAI",
    statusBarStyle: "black-translucent",
  },
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#06131b" />
      </head>
      <body>
        <Nav />
        <main className="mx-auto min-h-[calc(100vh-65px)] w-full max-w-7xl px-4 py-4 pb-24 sm:px-6 sm:py-6 sm:pb-6">
          {children}
        </main>
      </body>
    </html>
  );
}
