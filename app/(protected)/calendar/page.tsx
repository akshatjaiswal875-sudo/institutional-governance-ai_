// @ts-nocheck
"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, MapPin, Sparkles, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Kind = "meeting" | "event" | "availability";
type Item = { id: string; title: string; start: Date; end?: Date; kind: Kind; location?: string | null };

const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const weekdays = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const time = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export default function CalendarPage() {
  const supabase = useMemo(() => createClient(), []);
  const [month, setMonth] = useState(monthStart(new Date()));
  const [selected, setSelected] = useState(new Date());
  const [items, setItems] = useState<Item[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    async function load() {
      setLoading(true);
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      setEmail(auth.user.email ?? "");
      const from = month.toISOString();
      const to = new Date(month.getFullYear(), month.getMonth() + 1, 1).toISOString();
      const [m, e, a] = await Promise.all([
        supabase.from("meetings").select("id,title,date,location").gte("date", from).lt("date", to).order("date"),
        supabase.from("events").select("id,title,start_time,end_time,location").gte("start_time", from).lt("start_time", to).order("start_time"),
        supabase.from("user_availability").select("day_of_week,start_time,end_time").eq("user_id", auth.user.id),
      ]);
      const next: Item[] = [];
      for (const row of m.data ?? []) next.push({ id: `m-${row.id}`, title: row.title, start: new Date(row.date), kind: "meeting", location: row.location });
      for (const row of e.data ?? []) next.push({ id: `e-${row.id}`, title: row.title, start: new Date(row.start_time), end: row.end_time ? new Date(row.end_time) : undefined, kind: "event", location: row.location });
      for (const row of a.data ?? []) {
        for (let day = 1; day <= 31; day++) {
          const date = new Date(month.getFullYear(), month.getMonth(), day);
          if (date.getMonth() !== month.getMonth()) break;
          if (date.getDay() !== Number(row.day_of_week)) continue;
          const [sh, sm] = String(row.start_time).slice(0, 5).split(":").map(Number);
          const [eh, em] = String(row.end_time).slice(0, 5).split(":").map(Number);
          const start = new Date(date); start.setHours(sh, sm, 0, 0);
          const end = new Date(date); end.setHours(eh, em, 0, 0);
          next.push({ id: `a-${date.toISOString()}-${row.start_time}`, title: "Available", start, end, kind: "availability" });
        }
      }
      if (live) { setItems(next); setLoading(false); }
    }
    load();
    return () => { live = false; };
  }, [month, supabase]);

  const cells = useMemo(() => {
    const offset = month.getDay();
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const count = Math.ceil((offset + days) / 7) * 7;
    return Array.from({ length: count }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i - offset + 1));
  }, [month]);

  const selectedItems = items.filter(x => sameDay(x.start, selected) && x.kind !== "availability");
  const meetings = items.filter(x => x.kind === "meeting").length;
  const events = items.filter(x => x.kind === "event").length;
  const availability = items.filter(x => x.kind === "availability").length;
  const changeMonth = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));

  return (
    <main className="min-h-[calc(100vh-70px)] bg-[#050b08] text-[#e9e7f5]">
      <section className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:py-8">
        <div className="mb-6 rounded-3xl border border-white/[.08] bg-gradient-to-br from-[#0d1711] via-[#0a120d] to-[#171020] p-6 shadow-2xl lg:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-5">
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-[#AAAE7F]/25 bg-[#81559B]/15 shadow-[0_0_50px_rgba(129,85,155,.25)]">
                <div className="absolute inset-1 rounded-xl border border-dashed border-[#AAAE7F]/20" />
                <CalendarDays size={28} className="text-[#AAAE7F]" />
              </div>
              <div>
                <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.22em] text-[#AAAE7F]"><Sparkles size={13}/> Personal workspace</div>
                <h1 className="text-3xl font-black tracking-tight sm:text-4xl">My Calendar</h1>
                <p className="mt-1 text-sm text-white/50">Meetings, events and your availability — all in one view.</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-3"><Stat label="Meetings" value={meetings}/><Stat label="Events" value={events}/><Stat label="Open days" value={availability}/></div>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="overflow-hidden rounded-3xl border border-white/[.08] bg-[#0a120d]/90 shadow-2xl backdrop-blur-xl">
            <div className="flex flex-col gap-4 border-b border-white/[.07] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div><p className="text-xs uppercase tracking-[.18em] text-[#AAAE7F]/70">Institutional time</p><h2 className="mt-1 text-2xl font-bold">{months[month.getMonth()]} <span className="text-[#AAAE7F]">{month.getFullYear()}</span></h2></div>
              <div className="flex items-center gap-2"><button className="rounded-xl border border-white/10 p-2.5 text-white/60 hover:bg-white/5" onClick={() => changeMonth(-1)} aria-label="Previous month"><ChevronLeft size={18}/></button><button className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-white/70 hover:bg-white/5" onClick={() => { const now = new Date(); setMonth(monthStart(now)); setSelected(now); }}>Today</button><button className="rounded-xl border border-white/10 p-2.5 text-white/60 hover:bg-white/5" onClick={() => changeMonth(1)} aria-label="Next month"><ChevronRight size={18}/></button></div>
            </div>
            <div className="grid grid-cols-7 border-b border-white/[.06]">{weekdays.map(day => <div key={day} className="py-3 text-center text-[10px] font-bold uppercase tracking-widest text-white/35">{day}</div>)}</div>
            <div className="grid grid-cols-7">
              {cells.map(day => {
                const dayItems = items.filter(x => sameDay(x.start, day) && x.kind !== "availability");
                const current = day.getMonth() === month.getMonth();
                const today = sameDay(day, new Date());
                const chosen = sameDay(day, selected);
                return <button key={day.toISOString()} onClick={() => setSelected(day)} className={`min-h-[94px] border-b border-r border-white/[.045] p-2 text-left transition sm:min-h-[118px] sm:p-3 ${current ? "" : "opacity-30"} ${chosen ? "bg-[#81559B]/10" : "hover:bg-white/[.025]"}`}>
                  <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${today ? "bg-[#AAAE7F] text-[#071006]" : chosen ? "bg-[#81559B]/35 text-white" : "text-white/60"}`}>{day.getDate()}</span>
                  <div className="mt-2 space-y-1">{dayItems.slice(0, 3).map(item => <div key={item.id} className={`truncate rounded-md px-1.5 py-1 text-[9px] font-semibold sm:text-[10px] ${item.kind === "meeting" ? "bg-[#81559B]/20 text-[#d9c9e3]" : "bg-[#AAAE7F]/12 text-[#dce0bb]"}`}>{time(item.start)} · {item.title}</div>)}{dayItems.length > 3 && <div className="px-1 text-[9px] text-white/30">+{dayItems.length - 3} more</div>}</div>
                </button>;
              })}
            </div>
            {loading && <div className="border-t border-white/[.06] px-5 py-3 text-xs text-white/35">Syncing your calendar…</div>}
          </section>

          <aside className="rounded-3xl border border-white/[.08] bg-[#0a120d]/90 p-5 shadow-2xl backdrop-blur-xl">
            <p className="text-xs uppercase tracking-[.18em] text-[#AAAE7F]/70">Selected day</p>
            <h3 className="mt-1 text-xl font-bold">{selected.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</h3>
            <div className="my-5 rounded-2xl border border-[#AAAE7F]/10 bg-[#AAAE7F]/5 p-4"><div className="flex items-center gap-2 text-xs font-semibold text-[#AAAE7F]"><UserRound size={14}/> {email ? email.split("@")[0] : "Your schedule"}</div><p className="mt-2 text-sm leading-6 text-white/50">Calendar is available to every member. Role privileges will be decided later.</p></div>
            <div className="space-y-3">{selectedItems.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center"><Clock3 className="mx-auto mb-2 text-white/20" size={22}/><p className="text-sm text-white/35">Nothing scheduled</p><p className="mt-1 text-[11px] text-white/20">Your availability is still tracked.</p></div> : selectedItems.map(item => <div key={item.id} className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4"><div className="flex items-start gap-3"><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${item.kind === "meeting" ? "bg-[#81559B]" : "bg-[#AAAE7F]"}/><div className="min-w-0"><p className="font-semibold text-white/85">{item.title}</p><p className="mt-1 flex items-center gap-1 text-xs text-white/40"><Clock3 size={12}/> {time(item.start)}{item.end ? ` – ${time(item.end)}` : ""}</p>{item.location && <p className="mt-1 flex items-center gap-1 text-xs text-white/35"><MapPin size={12}/> {item.location}</p>}</div></div></div>)}</div>
            <div className="mt-6 flex gap-4 border-t border-white/[.06] pt-4 text-[10px] uppercase tracking-widest text-white/35"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#81559B]"/> Meeting</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#AAAE7F]"/> Event</span></div>
          </aside>
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) { return <div className="min-w-[78px] rounded-2xl border border-white/[.07] bg-white/[.025] px-3 py-2 text-center"><p className="text-xl font-black">{value}</p><p className="mt-0.5 text-[9px] uppercase tracking-widest text-white/30">{label}</p></div>; }
