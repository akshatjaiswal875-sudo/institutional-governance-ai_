"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Plus, Save, Trash2 } from "lucide-react";

type Availability = { day_of_week: number; start_time: string; end_time: string; available: boolean };
type Exception = { starts_at: string; ends_at: string; reason: string };
type Preferences = {
  timezone: string; preferred_start_time: string | null; preferred_end_time: string | null;
  default_duration_minutes: number; buffer_minutes: number; max_meetings_per_day: number;
};
type ProfileData = { availability: Availability[]; preferences: Preferences; unavailability: Array<Exception & { id: string }> };
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DEFAULT_PREFERENCES: Preferences = { timezone: "Asia/Kolkata", preferred_start_time: null, preferred_end_time: null, default_duration_minutes: 60, buffer_minutes: 15, max_meetings_per_day: 5 };

async function requestProfile(method: "GET" | "PUT", body?: unknown) {
  const response = await fetch("/api/calendar/profile", {
    method, headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Request failed");
  return result.data;
}
function localDateTime(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

export function SchedulingProfile() {
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [exceptions, setExceptions] = useState<Exception[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    requestProfile("GET").then((data: ProfileData) => {
      if (!active) return;
      setAvailability(data.availability.map((row) => ({ ...row, start_time: String(row.start_time).slice(0, 5), end_time: String(row.end_time).slice(0, 5) })));
      setPreferences(data.preferences);
      setExceptions(data.unavailability.map((row) => ({ starts_at: localDateTime(row.starts_at), ends_at: localDateTime(row.ends_at), reason: row.reason ?? "" })));
    }).catch((e) => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function updateAvailability(index: number, patch: Partial<Availability>) {
    setAvailability((rows) => rows.map((row, i) => i === index ? { ...row, ...patch } : row));
  }
  function addAvailability(day = 1) {
    setAvailability((rows) => [...rows, { day_of_week: day, start_time: "09:00", end_time: "17:00", available: true }].sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time)));
  }
  function addException() {
    const start = new Date(); start.setDate(start.getDate() + 1); start.setHours(9, 0, 0, 0);
    const end = new Date(start); end.setHours(17, 0, 0, 0);
    setExceptions((rows) => [...rows, { starts_at: localDateTime(start.toISOString()), ends_at: localDateTime(end.toISOString()), reason: "" }]);
  }
  async function save() {
    setSaving(true); setError(""); setMessage("");
    try {
      const payload = {
        availability,
        preferences,
        unavailability: exceptions.map((row) => ({
          starts_at: new Date(row.starts_at).toISOString(),
          ends_at: new Date(row.ends_at).toISOString(),
          reason: row.reason,
        })),
      };
      await requestProfile("PUT", payload);
      setMessage("Your scheduling profile has been saved.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save your profile."); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="rounded-3xl border border-white/10 bg-[#0a120d] p-8 text-sm text-white/50">Loading your scheduling profile…</div>;

  return <div className="space-y-6 text-[#e9e7f5]">
    <header className="rounded-3xl border border-white/[.08] bg-gradient-to-br from-[#0d1711] via-[#0a120d] to-[#171020] p-6 shadow-xl sm:p-8">
      <div className="flex items-center gap-4"><div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#AAAE7F]/25 bg-[#81559B]/15"><CalendarClock className="text-[#AAAE7F]" size={26}/></div><div><p className="text-[11px] font-semibold uppercase tracking-[.2em] text-[#AAAE7F]">Personal workspace</p><h1 className="mt-1 text-3xl font-black">My Scheduling Profile</h1><p className="mt-1 text-sm text-white/50">Tell the scheduler when you can meet and what works best for you.</p></div></div>
    </header>

    <section className="rounded-3xl border border-white/[.08] bg-[#0a120d]/90 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Weekly availability</h2><p className="mt-1 text-sm text-white/45">Add the time windows when you are normally available. No schedule is assumed until you save it.</p></div><button onClick={() => addAvailability()} className="inline-flex items-center gap-2 rounded-xl border border-[#AAAE7F]/30 px-3 py-2 text-sm text-[#d9dba9] hover:bg-white/5"><Plus size={15}/> Add time window</button></div>
      <div className="mt-5 space-y-3">
        {availability.length === 0 && <div className="rounded-2xl border border-dashed border-white/15 p-6 text-center text-sm text-white/40">No weekly availability added yet. Add your regular working hours or use the weekday preset below.</div>}
        {availability.map((row, index) => <div key={index} className="grid gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] p-3 sm:grid-cols-[1.1fr_1fr_1fr_auto_auto] sm:items-center">
          <select aria-label="Day" value={row.day_of_week} onChange={(e) => updateAvailability(index, { day_of_week: Number(e.target.value) })} className="rounded-lg border border-white/10 bg-[#101a14] px-3 py-2 text-sm text-white">{DAYS.map((day, i) => <option key={day} value={i}>{day}</option>)}</select>
          <label className="text-xs text-white/45">From<input type="time" value={row.start_time} onChange={(e) => updateAvailability(index, { start_time: e.target.value })} className="mt-1 block w-full rounded-lg border border-white/10 bg-[#101a14] px-3 py-2 text-sm text-white"/></label>
          <label className="text-xs text-white/45">Until<input type="time" value={row.end_time} onChange={(e) => updateAvailability(index, { end_time: e.target.value })} className="mt-1 block w-full rounded-lg border border-white/10 bg-[#101a14] px-3 py-2 text-sm text-white"/></label>
          <label className="flex items-center gap-2 text-xs text-white/55"><input type="checkbox" checked={row.available} onChange={(e) => updateAvailability(index, { available: e.target.checked })}/> Available</label>
          <button aria-label="Remove availability" onClick={() => setAvailability((rows) => rows.filter((_, i) => i !== index))} className="rounded-lg p-2 text-rose-300/70 hover:bg-rose-400/10"><Trash2 size={16}/></button>
        </div>)}
        <button onClick={() => { setAvailability((rows) => [...rows, ...[1,2,3,4,5].filter(day => !rows.some(row => row.day_of_week === day)).map(day => ({ day_of_week: day, start_time: "09:00", end_time: "17:00", available: true }))]); }} className="text-xs font-semibold text-[#AAAE7F] hover:text-white">＋ Add Monday–Friday, 9 AM–5 PM preset</button>
      </div>
    </section>

    <section className="rounded-3xl border border-white/[.08] bg-[#0a120d]/90 p-5 sm:p-6">
      <h2 className="text-lg font-bold">Meeting preferences</h2><p className="mt-1 text-sm text-white/45">These preferences help rank valid slots; they never override actual conflicts.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-xs text-white/55">Timezone<input value={preferences.timezone} onChange={(e) => setPreferences({ ...preferences, timezone: e.target.value })} placeholder="Asia/Kolkata" className="mt-1 block w-full rounded-xl border border-white/10 bg-[#101a14] px-3 py-2.5 text-sm text-white"/></label>
        <label className="text-xs text-white/55">Default meeting duration<select value={preferences.default_duration_minutes} onChange={(e) => setPreferences({ ...preferences, default_duration_minutes: Number(e.target.value) })} className="mt-1 block w-full rounded-xl border border-white/10 bg-[#101a14] px-3 py-2.5 text-sm text-white">{[15,30,45,60,90,120,180,240].map(n => <option key={n} value={n}>{n} minutes</option>)}</select></label>
        <label className="text-xs text-white/55">Preferred start<input type="time" value={preferences.preferred_start_time ?? ""} onChange={(e) => setPreferences({ ...preferences, preferred_start_time: e.target.value || null })} className="mt-1 block w-full rounded-xl border border-white/10 bg-[#101a14] px-3 py-2.5 text-sm text-white"/></label>
        <label className="text-xs text-white/55">Preferred end<input type="time" value={preferences.preferred_end_time ?? ""} onChange={(e) => setPreferences({ ...preferences, preferred_end_time: e.target.value || null })} className="mt-1 block w-full rounded-xl border border-white/10 bg-[#101a14] px-3 py-2.5 text-sm text-white"/></label>
        <label className="text-xs text-white/55">Break between meetings<select value={preferences.buffer_minutes} onChange={(e) => setPreferences({ ...preferences, buffer_minutes: Number(e.target.value) })} className="mt-1 block w-full rounded-xl border border-white/10 bg-[#101a14] px-3 py-2.5 text-sm text-white">{[0,5,10,15,20,30,45,60].map(n => <option key={n} value={n}>{n} minutes</option>)}</select></label>
        <label className="text-xs text-white/55">Maximum meetings per day<input type="number" min="1" max="20" value={preferences.max_meetings_per_day} onChange={(e) => setPreferences({ ...preferences, max_meetings_per_day: Number(e.target.value) })} className="mt-1 block w-full rounded-xl border border-white/10 bg-[#101a14] px-3 py-2.5 text-sm text-white"/></label>
      </div>
    </section>

    <section className="rounded-3xl border border-white/[.08] bg-[#0a120d]/90 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Leave and unavailable periods</h2><p className="mt-1 text-sm text-white/45">Add one-time exceptions such as leave, holidays or personal commitments.</p></div><button onClick={addException} className="inline-flex items-center gap-2 rounded-xl border border-[#AAAE7F]/30 px-3 py-2 text-sm text-[#d9dba9] hover:bg-white/5"><Plus size={15}/> Add exception</button></div>
      <div className="mt-4 space-y-3">
        {exceptions.length === 0 && <p className="rounded-2xl border border-dashed border-white/15 p-5 text-center text-sm text-white/40">No upcoming exceptions added.</p>}
        {exceptions.map((row, index) => <div key={index} className="grid gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] p-3 sm:grid-cols-2">
          <label className="text-xs text-white/45">Starts<input type="datetime-local" value={row.starts_at} onChange={(e) => setExceptions((rows) => rows.map((item, i) => i === index ? { ...item, starts_at: e.target.value } : item))} className="mt-1 block w-full rounded-lg border border-white/10 bg-[#101a14] px-3 py-2 text-sm text-white"/></label>
          <label className="text-xs text-white/45">Ends<input type="datetime-local" value={row.ends_at} onChange={(e) => setExceptions((rows) => rows.map((item, i) => i === index ? { ...item, ends_at: e.target.value } : item))} className="mt-1 block w-full rounded-lg border border-white/10 bg-[#101a14] px-3 py-2 text-sm text-white"/></label>
          <label className="text-xs text-white/45 sm:col-span-2">Reason (optional)<div className="mt-1 flex gap-2"><input value={row.reason} onChange={(e) => setExceptions((rows) => rows.map((item, i) => i === index ? { ...item, reason: e.target.value } : item))} maxLength={240} placeholder="Leave, appointment, holiday…" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#101a14] px-3 py-2 text-sm text-white"/><button aria-label="Remove exception" onClick={() => setExceptions((rows) => rows.filter((_, i) => i !== index))} className="rounded-lg px-3 text-rose-300/70 hover:bg-rose-400/10"><Trash2 size={16}/></button></div></label>
        </div>)}
      </div>
    </section>

    {(error || message) && <p role="status" className={`rounded-xl border px-4 py-3 text-sm ${error ? "border-rose-400/20 bg-rose-400/5 text-rose-200" : "border-emerald-400/20 bg-emerald-400/5 text-emerald-200"}`}>{error || message}</p>}
    <div className="flex justify-end"><button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#AAAE7F] px-5 py-3 text-sm font-bold text-[#071006] hover:brightness-110 disabled:opacity-50"><Save size={16}/>{saving ? "Saving profile…" : "Save scheduling profile"}</button></div>
  </div>;
}
