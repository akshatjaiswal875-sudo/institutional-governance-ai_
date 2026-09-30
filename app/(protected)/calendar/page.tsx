"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, MapPin, Sparkles, UserRound, Video, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Item = { id: string; title: string; start: Date; end?: Date; kind: "meeting" | "event" | "availability"; location?: string | null };

const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const weekdays = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function sameDay(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function formatTime(d: Date) { return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }

export default function CalendarPage() {
  const supabase = useMemo(() => createClient(), []);
  const [cursor, setCursor] = useState(startOfMonth(new Date()));
  const [selected, setSelected] = useState(new Date());
  const [items, setItems] = useState<Item[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user || !active) return;
      setEmail(auth.user.email ?? "");
      const from = new Date(cursor.getFullYear(), cursor.getMonth(), 1).toISOString();
      const to = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1).toISOString();
      const [meetings, events, availability] = await Promise.all([
        supabase.from("meetings").select("id,title,date,location").gte("date", from).lt("date", to).order("date"),
        supabase.from("events").select("id,title,start_time,end_time,location").gte("start_time", from).lt("start_time", to).order("start_time"),
        supabase.from("user_availability").select("day_of_week,start_time,end_time").eq("user_id", auth.user.id),
      ]);
      const next: Item[] = [];
      for (const m of meetings.data ?? []) next.push({ id: `m-${m.id}`, title: m.title, start: new Date(m.date), kind: "meeting", location: m.location });
      for (const e of events.data ?? []) next.push({ id: `e-${e.id}`, title: e.title, start: new Date(e.start_time), end: e.end_time ? new Date(e.end_time) : undefined, kind: "event", location: e.location });
      const availabilityRows = availability.data ?? [];
      for (const row of availabilityRows) {
        for (let day = 1; day <= 31; day++) {
          const d = new Date(cursor.getFullYear(), cursor.getMonth(), day);
          if (d.getMonth() !== cursor.getMonth()) break;
          if (d.getDay() === Number(row.day_of_week)) {
            const [sh, sm] = String(row.start_time).slice(0,5).split(":").map(Number);
            const start = new Date(d); start.setHours(sh, sm, 0, 0);
            const [eh, em] = String(row.end_time).slice(0,5).split(":").map(Number);
            const end = new Date(d); end.setHours(eh, em, 0, 0);
            next.push({ id: `a-${d.toISOString()}-${row.start_time}`, title: "Your availability", start, end, kind: "availability" });
          }
        }
      }
      if (active) { setItems(next); setLoading(false); }
    })();
    return () => { active = false; };
  }, [cursor, supabase]);

  const cells = useMemo(() => {
    const first = startOfMonth(cursor); const offset = first.getDay();
    const total = Math.ceil((offset + new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()) / 7) * 7;
    return Array.from({ length: total }, (_, i) => addDays(first, i - offset));
  }, [cursor]);

  const selectedItems = items.filter(x => sameDay(x.start, selected)).filter(x => x.kind !== "availability");
  const monthMeetings = items.filter(x => x.kind === "meeting").length;
  const monthEvents = items.filter(x => x.kind === "event").length;
  const monthAvailability = items.filter(x => x.kind === "availability").length;

  function move(n: number) { setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1)); }

  return <main className="min-h-[calc(100vh-70px)] overflow-hidden bg-[#050b08] text-[#e9e7f5]">
    <div className="pointer-events-none fixed inset-0 -z-0 overflow-hidden"><div className="absolute -left-32 top-20 h-80 w-80 rounded-full bg-[#81559B]/15 blur-[100px]" /><div className="absolute right-0 top-1/3 h-96 w-96 rounded-full bg-[#AAAE7F]/10 blur-[120px]" /></div>
    <section className="relative z-10 mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:py-8">
      <div className="mb-6 overflow-hidden rounded-3xl border border-white/[.08] bg-gradient-to-br from-[#0d1711]/95 via-[#0a120d]/90 to-[#171020]/90 p-6 shadow-2xl shadow-black/30 lg:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-5"><div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-[#AAAE7F]/25 bg-[#81559B]/15 shadow-[0_0_50px_rgba(129,85,155,.25)]"><div className="absolute inset-1 rounded-xl border border-dashed border-[#AAAE7F]/20 animate-[spin_18s_linear_infinite]" /><CalendarDays size={28} className="text-[#AAAE7F]" /></div><div><div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.22em] text-[#AAAE7F]"><Sparkles size={13}/> Personal workspace</div><h1 className="text-3xl font-black tracking-tight sm:text-4xl">My Calendar</h1><p className="mt-1 text-sm text-[#e9e7f5]/50">Your meetings, events and availability in one place.</p></div></div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3"><Stat label="Meetings" value={monthMeetings}/><Stat label="Events" value={monthEvents}/><Stat label="Availability" value={monthAvailability}/></div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="overflow-hidden rounded-3xl border border-white/[.08] bg-[#0a120d]/85 shadow-2xl shadow-black/20 backdrop-blur-xl">
          <div className="flex flex-col gap-4 border-b border-white/[.07] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"><div><p className="text-xs uppercase tracking-[.18em] text-[#AAAE7F]/70">Institutional time</p><h2 className="mt-1 text-2xl font-bold">{monthNames[cursor.getMonth()]} <span className="text-[#AAAE7F]">{cursor.getFullYear()}</span></h2></div><div className="flex items-center gap-2"><button className="rounded-xl border border-white/10 p-2.5 text-white/60 transition hover:bg-white/5 hover:text-white" onClick={() => move(-1)} aria-label="Previous month"><ChevronLeft size={18}/></button><button className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-white/70 transition hover:bg-white/5 hover:text-white" onClick={() => { const now = new Date(); setCursor(startOfMonth(now)); setSelected(now); }}>Today</button><button className="rounded-xl border border-white/10 p-2.5 text-white/60 transition hover:bg-white/5 hover:text-white" onClick={() => move(1)} aria-label="Next month"><ChevronRight size={18}/></button></div></div>
          <div className="grid grid-cols-7 border-b border-white/[.06]">{weekdays.map(d => <div key={d} className="px-1 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-white/35 sm:text-xs">{d}</div>)}</div>
          <div className="grid grid-cols-7">{cells.map((day, i) => { const dayItems = items.filter(x => sameDay(x.start, day) && x.kind !== "availability"); const inMonth = day.getMonth() === cursor.getMonth(); const isToday = sameDay(day, new Date()); const isSelected = sameDay(day, selected); return <button key={day.toISOString()} onClick={() => setSelected(day)} className={`group relative min-h-[92px] border-b border-r border-white/[.045] p-2 text-left transition sm:min-h-[116px] sm:p-3 ${inMonth ? "bg-transparent" : "bg-white/[.012] opacity-35"} ${isSelected ? "bg-[#81559B]/10" : "hover:bg-white/[.025]"}`}><span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${isToday ? "bg-[#AAAE7F] text-[#071006] shadow-[0_0_18px_rgba(170,174,127,.35)]" : isSelected ? "bg-[#81559B]/30 text-white" : "text-white/60"}`}>{day.getDate()}</span><div className="mt-2 space-y-1">{dayItems.slice(0,3).map(item => <div key={item.id} className={`truncate rounded-md px-1.5 py-1 text-[9px] font-semibold sm:text-[10px] ${item.kind === "meeting" ? "bg-[#81559B]/20 text-[#d9c9e3]" : "bg-[#AAAE7F]/12 text-[#dce0bb]"}`}><span className="hidden sm:inline">{formatTime(item.start)} · </span>{item.title}</div>)}{dayItems.length > 3 && <div className="px-1 text-[9px] text-white/30">+{dayItems.length - 3} more</div>}</div>{i === 0 && <span className="absolute right-2 top-2 text-[8px] text-[#AAAE7F]/50">LOCAL</span>}</button>; })}</div>
          {loading && <div className="border-t border-white/[.06] px-5 py-3 text-xs text-white/35">Syncing your calendar…</div>}
        </section>

        <aside className="rounded-3xl border border-white/[.08] bg-[#0a120d]/85 p-5 shadow-2xl shadow-black/20 backdrop-blur-xl">
          <div className="mb-5 flex items-start justify-between"><div><p className="text-xs uppercase tracking-[.18em] text-[#AAAE7F]/70">Selected day</p><h3 className="mt-1 text-xl font-bold">{selected.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</h3></div><button className="rounded-lg p-1.5 text-white/25 hover:bg-white/5 hover:text-white/70" onClick={() => setSelected(new Date())}><X size={15}/></button></div>
          <div className="mb-5 rounded-2xl border border-[#AAAE7F]/10 bg-gradient-to-br from-[#AAAE7F]/8 to-[#81559B]/8 p-4"><div className="flex items-center gap-2 text-xs font-semibold text-[#AAAE7F]"><UserRound size={14}/> {email ? email.split("@")[0] : "Your schedule"}</div><p className="mt-2 text-sm leading-6 text-white/50">Calendar access is available to every member. Role privileges can be defined later.</p></div>
          <div className="space-y-3">{selectedItems.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center"><Clock3 className="mx-auto mb-2 text-white/20" size={22}/><p className="text-sm text-white/35">Nothing scheduled</p><p className="mt-1 text-[11px] text-white/20">Your availability remains visible on this day.</p></div> : selectedItems.map(item => <div key={item.id} className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4"><div className="flex items-start gap-3"><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${item.kind === "meeting" ? "bg-[#81559B] shadow-[0_0_10px_rgba(129,85,155,.8)]" : "bg-[#AAAE7F] shadow-[0_0_10px_rgba(170,174,127,.7)]"}/><div className="min-w-0"><p className="font-semibold text-white/85">{item.title}</p><p className="mt-1 flex items-center gap-1 text-xs text-white/40"><Clock3 size={12}/> {formatTime(item.start)}{item.end ? ` – ${formatTime(item.end)}` : ""}</p>{item.location && <p className="mt-1 flex items-center gap-1 text-xs text-white/35"><MapPin size={12}/> {item.location}</p>}</div></div></div>)}</div>
          <div className="mt-6 border-t border-white/[.06] pt-4"><div className="flex items-center gap-4 text-[10px] uppercase tracking-widest text-white/35"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#81559B]"/> Meeting</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#AAAE7F]"/> Event</span></div></div>
        </aside>
      </div>
    </section>
  </main>;
}

function Stat({ label, value }: { label: string; value: number }) { return <div className="min-w-[78px] rounded-2xl border border-white/[.07] bg-white/[.025] px-3 py-2 text-center"><p className="text-xl font-black text-white/90">{value}</p><p className="mt-0.5 text-[9px] uppercase tracking-widest text-white/30">{label}</p></div>; }
