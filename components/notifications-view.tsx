"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Bell,
  CheckCheck,
  Clock3,
  ExternalLink,
  Info,
  CalendarDays,
  FileText,
  ListChecks,
  Settings2,
} from "lucide-react";

type Notification = {
  id: string;
  type: "info" | "meeting" | "event" | "policy" | "action" | "system";
  title: string;
  message: string;
  href?: string | null;
  read_at?: string | null;
  created_at: string;
};

const icons = {
  meeting: CalendarDays,
  event: CalendarDays,
  policy: FileText,
  action: ListChecks,
  system: Settings2,
  info: Info,
};

function relativeTime(value: string) {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 7
    ? `${days}d ago`
    : new Date(value).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}

async function readNotifications(): Promise<Notification[]> {
  const response = await fetch("/api/notifications", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || "Unable to load notifications.");
  return Array.isArray(payload?.data) ? (payload.data as Notification[]) : [];
}

async function markNotificationRead(id: string) {
  const response = await fetch("/api/notifications", {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || "Unable to update notification.");
  return payload?.data as { id: string; read_at: string };
}

export function NotificationsView() {
  const [rows, setRows] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    readNotifications()
      .then((data) => {
        if (active) setRows(data);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : "Unable to load notifications.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function markRead(id: string) {
    setError("");
    try {
      const updated = await markNotificationRead(id);
      setRows((current) =>
        current.map((item) => (item.id === id ? { ...item, read_at: updated.read_at } : item)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update notification.");
    }
  }

  async function markAllRead() {
    const unread = rows.filter((item) => !item.read_at).map((item) => item.id);
    if (!unread.length) return;
    setError("");
    try {
      const results = await Promise.all(unread.map((id) => markNotificationRead(id)));
      const readAt = new Map(results.map((item) => [item.id, item.read_at]));
      setRows((current) =>
        current.map((item) =>
          item.read_at ? item : { ...item, read_at: readAt.get(item.id) || new Date().toISOString() },
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update notifications.");
    }
  }

  const unread = rows.filter((item) => !item.read_at).length;

  return (
    <main className="space-y-6 pb-10">
      <section className="relative overflow-hidden rounded-[30px] border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-950 to-violet-950/25 p-6 sm:p-8">
        <div className="absolute right-0 top-0 h-full w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(139,92,246,.14),transparent_60%)]" />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[.15em] text-violet-300">
              <Bell size={13} /> Governance notifications
            </div>
            <h1 className="text-3xl font-bold text-white sm:text-4xl">Notifications</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Stay informed about meetings, events, policies and action items that require your attention.
            </p>
          </div>
          <button className="btn btn-secondary" onClick={() => void markAllRead()} disabled={!unread}>
            <CheckCheck size={16} /> Mark all read
          </button>
        </div>
        <div className="relative mt-6 grid max-w-xl grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/5 bg-white/[.035] p-4">
            <p className="text-2xl font-bold text-white">{rows.length}</p>
            <p className="text-xs text-slate-500">Total notifications</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/[.035] p-4">
            <p className="text-2xl font-bold text-violet-300">{unread}</p>
            <p className="text-xs text-slate-500">Unread</p>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-300" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <section className="space-y-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-24 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/70" />
          ))}
        </section>
      ) : rows.length ? (
        <section className="space-y-3">
          {rows.map((item) => {
            const Icon = icons[item.type] || Bell;
            const content = (
              <div className={`group rounded-2xl border p-4 transition ${item.read_at ? "border-slate-800 bg-slate-900/60" : "border-violet-400/20 bg-violet-400/[.045] shadow-lg shadow-violet-950/10"}`}>
                <div className="flex gap-4">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.read_at ? "bg-slate-800 text-slate-400" : "bg-violet-400/10 text-violet-300"}`}>
                    <Icon size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-white">{item.title}</h2>
                      {!item.read_at && <span className="rounded-full bg-violet-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-300">New</span>}
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-400">{item.message}</p>
                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                      <Clock3 size={12} /> {relativeTime(item.created_at)}
                    </div>
                  </div>
                  {!item.read_at && (
                    <button
                      className="self-start rounded-lg p-2 text-slate-500 hover:bg-white/5 hover:text-white"
                      title="Mark as read"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void markRead(item.id);
                      }}
                    >
                      <CheckCheck size={15} />
                    </button>
                  )}
                  {item.href && <ExternalLink size={15} className="mt-2 shrink-0 text-slate-700 group-hover:text-violet-300" />}
                </div>
              </div>
            );
            return item.href ? (
              <Link
                href={item.href}
                key={item.id}
                onClick={() => {
                  if (!item.read_at) void markRead(item.id);
                }}
              >
                {content}
              </Link>
            ) : (
              <div key={item.id}>{content}</div>
            );
          })}
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 p-12 text-center">
          <Bell className="mx-auto text-slate-600" size={30} />
          <h2 className="mt-4 text-lg font-semibold text-white">You're all caught up</h2>
          <p className="mt-2 text-sm text-slate-500">New governance updates will appear here.</p>
        </section>
      )}
    </main>
  );
}
