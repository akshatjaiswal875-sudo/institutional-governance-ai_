import type { Metadata } from "next";
import { ReactNode } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import "./globals.css";

export const metadata: Metadata = {
  title: "GovAI — Institutional Governance OS",
  description: "AI-powered institutional governance platform for meetings, events, policies, decisions and action items.",
  applicationName: "GovAI",
  themeColor: "#0F2342",
  viewport: {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
  },
  appleWebApp: {
    capable: true,
    title: "GovAI",
    statusBarStyle: "default",
  },
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#0F2342" />
      </head>
      <body>
        <DashboardLayout>{children}</DashboardLayout>
      </body>
    </html>
  );
}
