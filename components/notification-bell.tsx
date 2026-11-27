"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell, CheckCheck, Clock3, ExternalLink, ListChecks, CalendarDays, FileText, Info } from "lucide-react";

type Notification = { id: string; type: string; title: string; message: string; href?: string | null; read_at?: string | null; created_at: string };
const iconFor = (type: string) => type === "meeting" || type === "event" ? CalendarDays : type === "task" || type === "action" ? ListChecks : type === "policy" ? FileText : Info;
function ago(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return minutes + "m ago";
  if (minutes < 1440) return Math.floor(minutes / 60) + "h ago";
  return Math.floor(minutes / 1440) + "d ago";
}
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Notification[]>([]);
  const [busy, setBusy] = useState(false);
  const unread = rows.filter(row => !row.read_at).length;

  async function refresh() {
    try {
      const response = await fetch("/api/notifications", { credentials: "include", cache: "no-store" });
      const payload = await response.json();
      if (response.ok && Array.isArray(payload.data)) setRows(payload.data);
    } catch { /* Keep the last known notification state visible. */ }
  }
  async function markRead(id: string) {
    setRows(current => current.map(row => row.id === id ? { ...row, read_at: new Date().toISOString() } : row));
    try {
      const response = await fetch("/api/notifications", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (!response.ok) throw new Error("Unable to mark notification as read.");
    } catch { void refresh(); }
  }
  async function markAllRead() {
    if (busy || unread === 0) return;
    setBusy(true);
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_all_read" }),
      });
      if (!response.ok) throw new Error("Unable to mark notifications as read.");
      const payload = await response.json();
      const readAtById = new Map<string, string>(
        (Array.isArray(payload.data) ? payload.data : []).map((item: { id: string; read_at: string }) => [item.id, item.read_at] as [string, string]),
      );
      setRows(current => current.map(row => row.read_at ? row : {
        ...row,
        read_at: readAtById.get(row.id) || new Date().toISOString(),
      }));
    } catch {
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 30000);
    return () => window.clearInterval(timer);
  }, []);

  return <div className="relative">
    <button type="button" onClick={() => setOpen(value => !value)} className="relative flex h-10 w-10 items-center justify-center rounded-xl text-[#D8D8F6]/65 transition hover:bg-[#81559B]/12 hover:text-[#D8D8F6]" title="Notifications" aria-label="Notifications" aria-expanded={open}>
      <Bell size={18}/>{unread > 0 && <span className="absolute right-0 top-0 min-w-4 rounded-full bg-[#7E3F8F] px-1 text-center text-[9px] font-bold leading-4 text-white">{unread > 99 ? "99+" : unread}</span>}
    </button>
    {open && <><button aria-label="Close notifications" className="fixed inset-0 z-40 cursor-default" onClick={()=>setOpen(false)}/><section className="absolute right-0 z-50 mt-3 w-[min(92vw,390px)] overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-2xl">
      <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><h2 className="text-sm font-bold">Notifications</h2><p className="text-[11px] text-slate-500">{unread} unread</p></div><button type="button" disabled={!unread || busy} onClick={()=>void markAllRead()} className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700 disabled:opacity-40"><CheckCheck size={13}/> Mark all read</button></header>
      <div className="max-h-[420px] overflow-y-auto">{rows.length ? rows.slice(0, 8).map(row=>{const Icon=iconFor(row.type);const body=<div className={`flex gap-3 px-4 py-3 transition hover:bg-slate-50 ${row.read_at?"":"bg-violet-50/60"}`}><span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${row.read_at?"bg-slate-100 text-slate-500":"bg-violet-100 text-violet-700"}`}><Icon size={15}/></span><span className="min-w-0 flex-1"><span className="flex items-start justify-between gap-2"><span className="text-xs font-bold text-slate-800">{row.title}</span>{!row.read_at&&<i className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-violet-600"/>}</span><span className="mt-1 block text-[11px] leading-5 text-slate-600">{row.message}</span><span className="mt-1 flex items-center gap-1 text-[10px] text-slate-400"><Clock3 size={10}/>{ago(row.created_at)}</span></span>{row.href&&<ExternalLink size={13} className="mt-1 shrink-0 text-slate-400"/>}</div>;
        return row.href ? <Link key={row.id} href={row.href} onClick={()=>{if(!row.read_at)void markRead(row.id);setOpen(false);}}>{body}</Link> : <button key={row.id} type="button" onClick={()=>{if(!row.read_at)void markRead(row.id);}} className="block w-full text-left">{body}</button>;
      }) : <div className="px-5 py-10 text-center"><Bell className="mx-auto mb-2 text-slate-300" size={24}/><p className="text-xs font-semibold text-slate-600">You're all caught up</p><p className="mt-1 text-[11px] text-slate-400">New updates will appear here.</p></div>}</div>
      <Link href="/notifications" onClick={()=>setOpen(false)} className="block border-t border-slate-100 px-4 py-3 text-center text-xs font-bold text-violet-700 hover:bg-slate-50">View all notifications</Link>
    </section></>}
  </div>;
}
