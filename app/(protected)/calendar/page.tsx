"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, MapPin, RefreshCw, ListChecks, GraduationCap, Users, PartyPopper } from "lucide-react";

type Kind = "meeting" | "event" | "task" | "timetable";
type CalendarItem = { id: string; sourceId: string; title: string; start: Date; end?: Date | null; kind: Kind; location?: string | null; status?: string | null; href?: string | null; allDay?: boolean; recurring?: boolean };
type View = "month" | "week" | "day" | "agenda";
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const META: Record<Kind, { label: string; dot: string; pill: string; icon: typeof Users }> = {
  meeting: { label: "Meeting", dot: "bg-violet-600", pill: "border-violet-200 bg-violet-50 text-violet-800", icon: Users },
  event: { label: "Event", dot: "bg-teal-600", pill: "border-teal-200 bg-teal-50 text-teal-800", icon: PartyPopper },
  task: { label: "Task", dot: "bg-amber-500", pill: "border-amber-200 bg-amber-50 text-amber-800", icon: ListChecks },
  timetable: { label: "Timetable", dot: "bg-sky-600", pill: "border-sky-200 bg-sky-50 text-sky-800", icon: GraduationCap },
};
function startOfMonth(date: Date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
function startOfWeek(date: Date) { const value = new Date(date); value.setDate(value.getDate() - value.getDay()); value.setHours(0,0,0,0); return value; }
function endOfDay(date: Date) { const value = new Date(date); value.setHours(23,59,59,999); return value; }
function sameDay(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function formatTime(date: Date) { return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
function rangeFor(anchor: Date, view: View) {
  if (view === "day") { const from = new Date(anchor); from.setHours(0,0,0,0); return { from, to: new Date(from.getFullYear(),from.getMonth(),from.getDate()+1) }; }
  if (view === "week") { const from = startOfWeek(anchor); return { from, to: new Date(from.getFullYear(),from.getMonth(),from.getDate()+7) }; }
  const from = startOfMonth(anchor); return { from, to: new Date(anchor.getFullYear(),anchor.getMonth()+1,1) };
}
function eventTime(item: CalendarItem) { return item.allDay ? "All day" : formatTime(item.start) + (item.end ? " – " + formatTime(item.end) : ""); }
function dateLabel(date: Date) { return date.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" }); }

export default function CalendarPage() {
  const [anchor, setAnchor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => new Date());
  const [view, setView] = useState<View>("month");
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<Record<Kind, boolean>>({ meeting: true, event: true, task: true, timetable: true });

  const range = useMemo(() => rangeFor(anchor, view), [anchor, view]);
  async function loadCalendar(showRefresh = false) {
    if (showRefresh) setRefreshing(true); else setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ from: range.from.toISOString(), to: range.to.toISOString() });
      const response = await fetch("/api/calendar?" + params.toString(), { credentials: "include", cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Unable to load calendar.");
      const parsed = (payload?.data ?? []).map((item: Record<string, unknown>) => ({ ...item, start: new Date(String(item.start)), end: item.end ? new Date(String(item.end)) : null })) as CalendarItem[];
      setItems(parsed);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load calendar.");
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }

  useEffect(() => { void loadCalendar(); }, [range.from.getTime(), range.to.getTime()]);
  useEffect(() => {
    const timer = window.setInterval(() => { void loadCalendar(true); }, 60_000);
    const onFocus = () => { void loadCalendar(true); };
    window.addEventListener("focus", onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [range.from.getTime(), range.to.getTime()]);

  const visibleItems = useMemo(() => items.filter(item => filters[item.kind]), [items, filters]);
  const counts = useMemo(() => ({
    meeting: items.filter(item=>item.kind==="meeting").length,
    event: items.filter(item=>item.kind==="event").length,
    task: items.filter(item=>item.kind==="task").length,
    timetable: items.filter(item=>item.kind==="timetable").length,
  }), [items]);
  const cells = useMemo(() => {
    const first = startOfMonth(anchor), offset = first.getDay(), totalDays = new Date(anchor.getFullYear(),anchor.getMonth()+1,0).getDate();
    const total = Math.ceil((offset+totalDays)/7)*7;
    return Array.from({length:total},(_,i)=>new Date(anchor.getFullYear(),anchor.getMonth(),i-offset+1));
  }, [anchor]);
  const weekDays = useMemo(() => Array.from({length:7},(_,i)=>{const d=startOfWeek(anchor);d.setDate(d.getDate()+i);return d;}),[anchor]);
  const selectedItems = visibleItems.filter(item=>sameDay(item.start,selected)).sort((a,b)=>a.start.getTime()-b.start.getTime());
  const heading = view==="month" || view==="agenda" ? MONTHS[anchor.getMonth()]+" "+anchor.getFullYear() : view==="week" ? dateLabel(weekDays[0])+" – "+weekDays[6].toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}) : dateLabel(anchor);
  function move(delta:number) {
    const next = new Date(anchor);
    if(view==="month"||view==="agenda") next.setMonth(next.getMonth()+delta);
    else if(view==="week") next.setDate(next.getDate()+7*delta);
    else next.setDate(next.getDate()+delta);
    setAnchor(next); setSelected(next);
  }
  function today() { const now=new Date();setAnchor(now);setSelected(now); }
  function toggle(kind:Kind) { setFilters(current=>({...current,[kind]:!current[kind]})); }

  return <main className="min-h-[calc(100vh-70px)] bg-slate-50 text-slate-800"><section className="mx-auto max-w-[1600px] space-y-5 px-4 py-6 sm:px-6 lg:py-8">
    <header className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-6 shadow-xl lg:p-8">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div><div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.2em] text-blue-700"><CalendarDays size={14}/> Institutional schedule</div><h1 className="text-3xl font-black tracking-tight sm:text-4xl">Calendar</h1><p className="mt-2 max-w-2xl text-sm text-slate-600">One live view of your timetable, meetings, events and assigned work.</p></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(Object.keys(META) as Kind[]).map(kind=>{const Icon=META[kind].icon;return <button key={kind} onClick={()=>toggle(kind)} aria-pressed={filters[kind]} className={`rounded-2xl border px-3 py-3 text-left transition ${filters[kind]?"border-slate-200 bg-white shadow-sm":"border-slate-200 bg-slate-100 opacity-50"}`}><span className="flex items-center gap-2 text-xs font-semibold"><i className={`h-2.5 w-2.5 rounded-full ${META[kind].dot}`}/>{META[kind].label}</span><span className="mt-1 block text-xl font-black">{counts[kind]}</span></button>})}
        </div>
      </div>
    </header>

    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-4 sm:p-5 xl:flex-row xl:items-center xl:justify-between">
        <div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-slate-500">Schedule overview</p><h2 className="mt-1 text-xl font-bold sm:text-2xl">{heading}</h2></div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">{(["month","week","day","agenda"] as View[]).map(option=><button key={option} onClick={()=>setView(option)} className={`rounded-lg px-3 py-2 text-xs font-semibold capitalize ${view===option?"bg-blue-700 text-white shadow":"text-slate-600 hover:bg-white"}`}>{option}</button>)}</div>
          <button onClick={()=>void loadCalendar(true)} className="rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50" aria-label="Refresh calendar" title="Refresh"><RefreshCw size={16} className={refreshing?"animate-spin":""}/></button>
          <button onClick={()=>move(-1)} className="rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50" aria-label="Previous period"><ChevronLeft size={18}/></button>
          <button onClick={today} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Today</button>
          <button onClick={()=>move(1)} className="rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50" aria-label="Next period"><ChevronRight size={18}/></button>
        </div>
      </div>

      {view==="month" && <><div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">{WEEKDAYS.map(day=><div key={day} className="py-3 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">{day}</div>)}</div><div className="grid grid-cols-7">{cells.map(day=>{const dayItems=visibleItems.filter(item=>sameDay(item.start,day));const current=day.getMonth()===anchor.getMonth(),isToday=sameDay(day,new Date()),chosen=sameDay(day,selected);return <button key={day.toISOString()} onClick={()=>setSelected(day)} className={`min-h-[108px] border-b border-r border-slate-100 p-1.5 text-left transition sm:min-h-[132px] sm:p-2.5 ${current?"":"bg-slate-50/70 text-slate-300"} ${chosen?"bg-blue-50":"hover:bg-slate-50"}`}><span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${isToday?"bg-blue-700 text-white":chosen?"bg-blue-100 text-blue-800":"text-slate-700"}`}>{day.getDate()}</span><div className="mt-1.5 space-y-1">{dayItems.slice(0,3).map(item=><div key={item.id} className={`truncate rounded-md border px-1.5 py-1 text-[9px] font-semibold sm:text-[10px] ${META[item.kind].pill}`}>{formatTime(item.start)} · {item.title}</div>)}{dayItems.length>3&&<div className="px-1 text-[9px] font-semibold text-slate-500">+{dayItems.length-3} more</div>}</div></button>})}</div></>}

      {view==="week" && <div className="grid grid-cols-1 divide-y divide-slate-100 md:grid-cols-7 md:divide-x md:divide-y-0">{weekDays.map(day=>{const dayItems=visibleItems.filter(item=>sameDay(item.start,day)).sort((a,b)=>a.start.getTime()-b.start.getTime());return <div key={day.toISOString()} className={`min-h-64 p-3 ${sameDay(day,selected)?"bg-blue-50/60":""}`}><button onClick={()=>setSelected(day)} className="mb-3 text-left"><span className="block text-[10px] font-bold uppercase tracking-widest text-slate-500">{WEEKDAYS[day.getDay()]}</span><span className={`mt-1 inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${sameDay(day,new Date())?"bg-blue-700 text-white":"text-slate-800"}`}>{day.getDate()}</span></button><div className="space-y-2">{dayItems.length?dayItems.map(item=><CalendarCard key={item.id} item={item}/>):<p className="text-[11px] text-slate-300">No items</p>}</div></div>})}</div>}

      {view==="day" && <div className="p-4 sm:p-6"><div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700"><CalendarDays size={16}/>{dateLabel(selected)}</div>{selectedItems.length?<div className="space-y-3">{selectedItems.map(item=><CalendarCard key={item.id} item={item} roomy/>)}</div>:<EmptyDay/>}</div>}

      {view==="agenda" && <div className="space-y-3 p-4 sm:p-6">{visibleItems.length?visibleItems.map(item=><div key={item.id} className="flex gap-4"><div className="w-16 shrink-0 pt-1 text-right"><p className="text-xs font-bold text-slate-800">{item.start.toLocaleDateString("en-IN",{day:"2-digit",month:"short"})}</p><p className="text-[10px] text-slate-500">{formatTime(item.start)}</p></div><div className={`min-w-0 flex-1 border-l-2 pl-4 ${META[item.kind].dot.replace("bg-","border-")}`}><CalendarCard item={item} roomy/></div></div>):<EmptyDay/>}</div>}

      {error&&<div className="border-t border-rose-200 bg-rose-50 px-5 py-3 text-xs text-rose-700">{error}</div>}
      {loading&&<div className="border-t border-slate-200 px-5 py-3 text-xs text-slate-500">Loading your institutional schedule…</div>}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 px-5 py-4 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{(Object.keys(META) as Kind[]).map(kind=><span key={kind} className="flex items-center gap-1.5"><i className={`h-2 w-2 rounded-full ${META[kind].dot}`}/>{META[kind].label}</span>)}</div>
    </section>

    {view==="month" && <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-lg"><div className="mb-4"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-slate-500">Selected date</p><h3 className="mt-1 text-lg font-bold">{dateLabel(selected)}</h3></div>{selectedItems.length?<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{selectedItems.map(item=><CalendarCard key={item.id} item={item} roomy/>)}</div>:<EmptyDay/>}</section>}
    <p className="text-center text-[11px] text-slate-400">Calendar sync refreshes automatically every minute and when you return to this page.</p>
  </section></main>;
}

function CalendarCard({item,roomy=false}:{item:CalendarItem;roomy?:boolean}) {
  const Icon=META[item.kind].icon;
  const content=<div className={`rounded-xl border p-3 ${META[item.kind].pill}`}><div className="flex items-start gap-2"><Icon size={15} className="mt-0.5 shrink-0"/><div className="min-w-0 flex-1"><p className={`font-semibold ${roomy?"text-sm":"text-xs"}`}>{item.title}</p><p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] opacity-75"><span className="inline-flex items-center gap-1"><Clock3 size={11}/>{eventTime(item)}</span>{item.status&&<span>· {item.status}</span>}{item.recurring&&<span>· Weekly</span>}</p>{item.location&&<p className="mt-1 flex items-center gap-1 text-[10px] opacity-75"><MapPin size={11}/>{item.location}</p>}</div></div></div>;
  return item.href?<Link href={item.href} className="block rounded-xl transition hover:-translate-y-0.5 hover:shadow-sm">{content}</Link>:content;
}
function EmptyDay(){return <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center"><Clock3 className="mx-auto mb-2 text-slate-300" size={22}/><p className="text-sm font-semibold text-slate-600">Nothing scheduled here</p><p className="mt-1 text-xs text-slate-400">New timetable periods, meetings, events and tasks will appear when they are added.</p></div>}
