"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Mic2,
  Plus,
  Sparkles,
  TrendingUp,
  Users,
  Video,
} from "lucide-react";

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { "Content-Type": "application/json" } });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || "Request failed");
  return body?.data as T;
}

function formatDate(value?: string | null) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function displayName(user: { email?: string | null; user_metadata?: Record<string, unknown> | null } | null) {
  const metadataName = user?.user_metadata?.full_name || user?.user_metadata?.name;
  if (typeof metadataName === "string" && metadataName.trim()) return metadataName.trim().split(/\s+/)[0];
  const local = (user?.email || "User").split("@")[0].replace(/[._-]+/g, " ").replace(/\d+/g, " ").trim();
  return local ? local.split(/\s+/)[0].replace(/^./, (c) => c.toUpperCase()) : "User";
}

const statusTone: Record<string, string> = {
  Published: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
  Approved: "border-cyan-400/20 bg-cyan-400/10 text-cyan-300",
  "Pending Approval": "border-amber-400/20 bg-amber-400/10 text-amber-300",
  Draft: "border-slate-700 bg-slate-800/70 text-slate-300",
};

export function FancyDashboard() {
  const [meetings, setMeetings] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [greetingName, setGreetingName] = useState("User");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setGreetingName(displayName(data.user));
    });

    Promise.all([
      getJson<any[]>("/api/meetings").catch(() => []),
      getJson<any[]>("/api/events").catch(() => []),
      getJson<any[]>("/api/users").catch(() => []),
    ]).then(([meetingRows, eventRows, userRows]) => {
      setMeetings(Array.isArray(meetingRows) ? meetingRows : []);
      setEvents(Array.isArray(eventRows) ? eventRows : []);
      setUsers(Array.isArray(userRows) ? userRows : []);
    }).finally(() => setLoading(false));
  }, []);

  const published = meetings.filter((m) => m.status === "Published").length;
  const approved = meetings.filter((m) => m.status === "Approved").length;
  const pending = meetings.filter((m) => m.status === "Pending Approval").length;
  const upcoming = useMemo(() => [...events].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()).slice(0, 4), [events]);
  const recentMeetings = useMemo(() => [...meetings].slice(0, 5), [meetings]);

  const metrics = [
    { label: "Total meetings", value: meetings.length, helper: `${published} published`, icon: CalendarDays, iconClass: "text-cyan-300 bg-cyan-400/10" },
    { label: "Pending review", value: pending, helper: "Needs attention", icon: Clock3, iconClass: "text-amber-300 bg-amber-400/10" },
    { label: "Approved", value: approved, helper: "Ready to publish", icon: CheckCircle2, iconClass: "text-emerald-300 bg-emerald-400/10" },
    { label: "Team members", value: users.length, helper: "Governance workspace", icon: Users, iconClass: "text-violet-300 bg-violet-400/10" },
  ];

  return (
    <main className="relative space-y-6 pb-10">
      <div className="pointer-events-none absolute -left-20 top-0 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-40 h-72 w-72 rounded-full bg-violet-500/10 blur-3xl" />

      <section className="relative overflow-hidden rounded-[30px] border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-950 to-cyan-950/30 p-6 shadow-2xl shadow-black/20 sm:p-8">
        <div className="absolute right-0 top-0 h-full w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,.13),transparent_60%)]" />
        <div className="relative flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[.16em] text-cyan-300"><Sparkles size={13} /> Governance command center</div>
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Good morning, {greetingName}.</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400 sm:text-base">Your institutional workspace at a glance. Review meetings, approvals and AI-powered intelligence from one place.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/meetings/new" className="btn btn-primary rounded-xl px-4 py-2.5"><Plus size={16} /> New meeting</Link>
            <Link href="/meetings" className="btn btn-secondary rounded-xl px-4 py-2.5">View meetings <ArrowRight size={15} /></Link>
          </div>
        </div>

        <div className="relative mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            return <div key={metric.label} className="rounded-2xl border border-white/5 bg-white/[.035] p-4 backdrop-blur-sm transition hover:-translate-y-0.5 hover:bg-white/[.06]">
              <div className="flex items-start justify-between"><span className={`flex h-10 w-10 items-center justify-center rounded-xl ${metric.iconClass}`}><Icon size={18} /></span><TrendingUp size={15} className="text-slate-600" /></div>
              <p className="mt-4 text-2xl font-bold text-white">{loading ? "—" : metric.value}</p>
              <p className="mt-1 text-sm font-medium text-slate-300">{metric.label}</p>
              <p className="mt-1 text-xs text-slate-500">{metric.helper}</p>
            </div>;
          })}
        </div>
      </section>

      <section className="relative grid gap-5 lg:grid-cols-[1.45fr_.85fr]">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl shadow-black/10 sm:p-6">
          <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.15em] text-cyan-400">Workspace activity</p><h2 className="mt-1 text-xl font-semibold text-white">Recent meetings</h2></div><Link href="/meetings" className="text-xs font-medium text-cyan-300 hover:text-cyan-200">View all <ArrowUpRight className="inline" size={13} /></Link></div>
          <div className="mt-5 space-y-2">
            {!loading && recentMeetings.length === 0 && <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center"><CalendarDays className="mx-auto text-slate-600" size={26} /><p className="mt-3 text-sm text-slate-400">No meetings yet.</p><Link href="/meetings/new" className="mt-3 inline-flex text-sm text-cyan-300">Create your first meeting</Link></div>}
            {recentMeetings.map((meeting) => <Link href={`/meetings/${meeting.id}`} key={meeting.id} className="group flex items-center gap-4 rounded-xl border border-transparent p-3 transition hover:border-slate-800 hover:bg-slate-950/70"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300"><Video size={18} /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-200 group-hover:text-white">{meeting.title}</p><p className="mt-1 text-xs text-slate-500">{formatDate(meeting.date)} · {meeting.location || "Remote"}</p></div><span className={`hidden rounded-full border px-2.5 py-1 text-[11px] font-medium sm:inline-flex ${statusTone[meeting.status] || statusTone.Draft}`}>{meeting.status}</span><ArrowRight size={15} className="text-slate-700 transition group-hover:translate-x-0.5 group-hover:text-cyan-400" /></Link>)}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-violet-500/10 via-slate-900/80 to-slate-950 p-5 shadow-xl shadow-black/10 sm:p-6"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-400/10 text-violet-300"><BarChart3 size={18} /></div><div><p className="text-xs font-semibold uppercase tracking-[.15em] text-violet-300">AI intelligence</p><h2 className="mt-1 text-xl font-semibold text-white">Meeting pipeline</h2></div></div><p className="mt-5 text-sm leading-6 text-slate-400">Turn recordings into searchable transcripts, summaries, decisions and accountable action items.</p><div className="mt-5 space-y-2">{["Record meeting", "Generate transcript", "Extract decisions", "Track action items"].map((step, index) => <div key={step} className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/15 p-3"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-400/10 text-xs font-bold text-violet-300">{index + 1}</span><span className="text-sm text-slate-300">{step}</span>{index === 3 && <CheckCircle2 size={15} className="ml-auto text-emerald-400" />}</div>)}</div><Link href="/meetings" className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-violet-300 hover:text-violet-200">Open Meeting Intelligence <ArrowRight size={15} /></Link></div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[.9fr_1.1fr]">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 sm:p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.15em] text-emerald-400">Schedule</p><h2 className="mt-1 text-xl font-semibold text-white">Upcoming events</h2></div><CalendarDays size={18} className="text-slate-600" /></div><div className="mt-5 space-y-3">{upcoming.length ? upcoming.map((event) => <div key={event.id} className="flex gap-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3"><div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300"><span className="text-[10px] uppercase">{new Date(event.start_time).toLocaleString("en-IN", { month: "short" })}</span><span className="text-sm font-bold">{new Date(event.start_time).getDate()}</span></div><div className="min-w-0"><p className="truncate text-sm font-medium text-slate-200">{event.title}</p><p className="mt-1 text-xs text-slate-500">{formatDate(event.start_time)} · {event.location || "Online"}</p></div></div>) : <p className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">No upcoming events.</p>}</div></div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 sm:p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.15em] text-amber-400">Quick actions</p><h2 className="mt-1 text-xl font-semibold text-white">Keep governance moving</h2></div><Bell size={18} className="text-slate-600" /></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><Link href="/meetings/new" className="group rounded-xl border border-slate-800 bg-slate-950/50 p-4 transition hover:border-cyan-400/30 hover:bg-cyan-400/[.04]"><Mic2 className="text-cyan-300" size={20} /><p className="mt-3 text-sm font-semibold text-white">Capture a meeting</p><p className="mt-1 text-xs leading-5 text-slate-500">Upload audio/video and generate intelligence.</p><ArrowUpRight className="mt-3 text-slate-700 group-hover:text-cyan-400" size={15} /></Link><Link href="/meetings" className="group rounded-xl border border-slate-800 bg-slate-950/50 p-4 transition hover:border-violet-400/30 hover:bg-violet-400/[.04]"><FileText className="text-violet-300" size={20} /><p className="mt-3 text-sm font-semibold text-white">Review records</p><p className="mt-1 text-xs leading-5 text-slate-500">Search governed meetings and decisions.</p><ArrowUpRight className="mt-3 text-slate-700 group-hover:text-violet-400" size={15} /></Link></div></div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 px-5 py-4 text-xs text-slate-500"><span>Institutional Governance AI · Secure workspace</span><span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/40" /> Systems operational</span></div>
    </main>
  );
}
