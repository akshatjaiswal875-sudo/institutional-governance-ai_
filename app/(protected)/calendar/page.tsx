"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, MapPin, Sparkles, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type CalendarItem = {
  id: string;
  title: string;
  start: Date;
  end?: Date;
  kind: "meeting" | "availability";
  location?: string | null;
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function CalendarPage() {
  const supabase = useMemo(() => createClient(), []);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState(() => new Date());
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadCalendar() {
      setLoading(true);
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      if (!user) {
        if (!cancelled) setLoading(false);
        return;
      }

      if (!cancelled) setEmail(user.email ?? "");

      const from = new Date(month.getFullYear(), month.getMonth(), 1).toISOString();
      const to = new Date(month.getFullYear(), month.getMonth() + 1, 1).toISOString();

      const [meetingResult, availabilityResult] = await Promise.all([
        supabase.from("meetings").select("id,title,date,location").gte("date", from).lt("date", to).order("date"),
        supabase.from("user_availability").select("day_of_week,start_time,end_time").eq("user_id", user.id),
      ]);

      const next: CalendarItem[] = [];

      for (const meeting of meetingResult.data ?? []) {
        next.push({
          id: `meeting-${meeting.id}`,
          title: meeting.title ?? "Meeting",
          start: new Date(meeting.date),
          kind: "meeting",
          location: meeting.location,
        });
      }

      for (const row of availabilityResult.data ?? []) {
        const dayOfWeek = Number(row.day_of_week);
        const [startHour, startMinute] = String(row.start_time).slice(0, 5).split(":").map(Number);
        const [endHour, endMinute] = String(row.end_time).slice(0, 5).split(":").map(Number);
        const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();

        for (let day = 1; day <= daysInMonth; day += 1) {
          const date = new Date(month.getFullYear(), month.getMonth(), day);
          if (date.getDay() !== dayOfWeek) continue;
          const start = new Date(date);
          const end = new Date(date);
          start.setHours(startHour, startMinute, 0, 0);
          end.setHours(endHour, endMinute, 0, 0);
          next.push({ id: `availability-${date.toISOString()}-${row.start_time}`, title: "Available", start, end, kind: "availability" });
        }
      }

      if (!cancelled) {
        setItems(next);
        setLoading(false);
      }
    }

    loadCalendar();
    return () => {
      cancelled = true;
    };
  }, [month, supabase]);

  const cells = useMemo(() => {
    const firstDay = startOfMonth(month);
    const offset = firstDay.getDay();
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const totalCells = Math.ceil((offset + daysInMonth) / 7) * 7;
    return Array.from({ length: totalCells }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index - offset + 1));
  }, [month]);

  const meetings = items.filter((item) => item.kind === "meeting");
  const availability = items.filter((item) => item.kind === "availability");
  const selectedItems = meetings.filter((item) => sameDay(item.start, selected));

  function moveMonth(delta: number) {
    setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));
  }

  function goToday() {
    const today = new Date();
    setMonth(startOfMonth(today));
    setSelected(today);
  }

  return (
    <main className="min-h-[calc(100vh-70px)] bg-[#050b08] text-[#e9e7f5]">
      <section className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:py-8">
        <header className="mb-6 rounded-3xl border border-white/[.08] bg-gradient-to-br from-[#0d1711] via-[#0a120d] to-[#171020] p-6 shadow-2xl lg:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-5">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-[#AAAE7F]/25 bg-[#81559B]/15 shadow-[0_0_50px_rgba(129,85,155,.25)]">
                <CalendarDays size={30} className="text-[#AAAE7F]" />
              </div>
              <div>
                <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.22em] text-[#AAAE7F]"><Sparkles size={13} /> Personal workspace</div>
                <h1 className="text-3xl font-black tracking-tight sm:text-4xl">My Calendar</h1>
                <p className="mt-1 text-sm text-white/50">Meetings and personal availability in one place.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
              <Stat label="Meetings" value={meetings.length} />
              <Stat label="Available" value={availability.length} />
              <Stat label="Days" value={new Set(availability.map((item) => item.start.toDateString())).size} />
            </div>
          </div>
        </header>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="overflow-hidden rounded-3xl border border-white/[.08] bg-[#0a120d]/90 shadow-2xl backdrop-blur-xl">
            <div className="flex flex-col gap-4 border-b border-white/[.07] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div>
                <p className="text-xs uppercase tracking-[.18em] text-[#AAAE7F]/70">Institutional time</p>
                <h2 className="mt-1 text-2xl font-bold">{MONTHS[month.getMonth()]} <span className="text-[#AAAE7F]">{month.getFullYear()}</span></h2>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => moveMonth(-1)} className="rounded-xl border border-white/10 p-2.5 text-white/60 transition hover:bg-white/5 hover:text-white" aria-label="Previous month"><ChevronLeft size={18} /></button>
                <button onClick={goToday} className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-white/70 transition hover:bg-white/5 hover:text-white">Today</button>
                <button onClick={() => moveMonth(1)} className="rounded-xl border border-white/10 p-2.5 text-white/60 transition hover:bg-white/5 hover:text-white" aria-label="Next month"><ChevronRight size={18} /></button>
              </div>
            </div>

            <div className="grid grid-cols-7 border-b border-white/[.06]">
              {WEEKDAYS.map((day) => <div key={day} className="py-3 text-center text-[10px] font-bold uppercase tracking-widest text-white/35">{day}</div>)}
            </div>

            <div className="grid grid-cols-7">
              {cells.map((day) => {
                const dayMeetings = meetings.filter((item) => sameDay(item.start, day));
                const currentMonth = day.getMonth() === month.getMonth();
                const today = sameDay(day, new Date());
                const chosen = sameDay(day, selected);
                return (
                  <button key={day.toISOString()} onClick={() => setSelected(day)} className={`min-h-[94px] border-b border-r border-white/[.045] p-2 text-left transition sm:min-h-[118px] sm:p-3 ${currentMonth ? "" : "opacity-30"} ${chosen ? "bg-[#81559B]/10" : "hover:bg-white/[.025]"}`}>
                    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${today ? "bg-[#AAAE7F] text-[#071006]" : chosen ? "bg-[#81559B]/35 text-white" : "text-white/60"}`}>{day.getDate()}</span>
                    <div className="mt-2 space-y-1">
                      {dayMeetings.slice(0, 3).map((item) => <div key={item.id} className="truncate rounded-md bg-[#81559B]/20 px-1.5 py-1 text-[9px] font-semibold text-[#d9c9e3] sm:text-[10px]">{formatTime(item.start)} · {item.title}</div>)}
                      {dayMeetings.length > 3 && <div className="px-1 text-[9px] text-white/30">+{dayMeetings.length - 3} more</div>}
                    </div>
                  </button>
                );
              })}
            </div>
            {loading && <div className="border-t border-white/[.06] px-5 py-3 text-xs text-white/35">Syncing your calendar…</div>}
          </section>

          <aside className="rounded-3xl border border-white/[.08] bg-[#0a120d]/90 p-5 shadow-2xl backdrop-blur-xl">
            <p className="text-xs uppercase tracking-[.18em] text-[#AAAE7F]/70">Selected day</p>
            <h3 className="mt-1 text-xl font-bold">{selected.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</h3>
            <div className="my-5 rounded-2xl border border-[#AAAE7F]/10 bg-[#AAAE7F]/5 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#AAAE7F]"><UserRound size={14} /> {email ? email.split("@")[0] : "Your schedule"}</div>
              <p className="mt-2 text-sm leading-6 text-white/50">Calendar is available to every member. Role privileges will be defined later.</p>
            </div>
            <div className="space-y-3">
              {selectedItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center"><Clock3 className="mx-auto mb-2 text-white/20" size={22} /><p className="text-sm text-white/35">Nothing scheduled</p><p className="mt-1 text-[11px] text-white/20">Your availability is still tracked.</p></div>
              ) : selectedItems.map((item) => (
                <div key={item.id} className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
                  <div className="flex items-start gap-3"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#81559B]" /><div className="min-w-0"><p className="font-semibold text-white/85">{item.title}</p><p className="mt-1 flex items-center gap-1 text-xs text-white/40"><Clock3 size={12} /> {formatTime(item.start)}</p>{item.location && <p className="mt-1 flex items-center gap-1 text-xs text-white/35"><MapPin size={12} /> {item.location}</p>}</div></div>
                </div>
              ))}
            </div>
            <div className="mt-6 flex gap-4 border-t border-white/[.06] pt-4 text-[10px] uppercase tracking-widest text-white/35"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#81559B]" /> Meeting</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#AAAE7F]" /> Availability</span></div>
          </aside>
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="min-w-[82px] rounded-2xl border border-white/[.07] bg-white/[.025] px-3 py-2 text-center"><p className="text-xl font-black">{value}</p><p className="mt-0.5 text-[9px] uppercase tracking-widest text-white/30">{label}</p></div>;
}
