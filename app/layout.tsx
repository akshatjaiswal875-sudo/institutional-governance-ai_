import type { Metadata, Viewport } from "next";
import { ReactNode } from "react";
import { Nav } from "@/components/nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "GovAI — Institutional Governance OS",
  description: "AI-powered institutional governance platform for meetings, events, policies, decisions and action items.",
  applicationName: "GovAI",
  appleWebApp: {
    capable: true,
    title: "GovAI",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#06131b",
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <main className="mx-auto min-h-[calc(100vh-65px)] w-full max-w-7xl px-4 py-4 pb-24 sm:px-6 sm:py-6 sm:pb-6">
          {children}
        </main>
      </body>
    </html>
  );
}
