"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { CalendarDays, CheckCircle2, Clock3, Link2, MapPin, Video } from "lucide-react";

async function createMeeting(body: unknown) {
  const response = await fetch("/api/meetings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Unable to create meeting.");
  return result.data;
}

export function OnlineMeetingForm() {
  const [type, setType] = useState<"offline" | "online">("offline");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<any>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    const date = String(form.get("date") ?? "");
    const time = String(form.get("time") ?? "09:00");
    const conferenceUrl = String(form.get("conference_url") ?? "").trim();
    if (!title || !date || !time) {
      setError("Title, date and time are required.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const data = await createMeeting({
        title,
        date: `${date}T${time}:00+05:30`,
        location: type === "online" ? "Online" : String(form.get("location") ?? ""),
        type,
        conference_url: type === "online" ? conferenceUrl : undefined,
      });
      setCreated(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create meeting.");
    } finally {
      setSaving(false);
    }
  }

  if (created) {
    const online = created.type === "online" && created.conference_url;
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-3xl font-semibold">Meeting created</h1>
          <p className="mt-2 text-slate-600">Your meeting has been saved and the online link has been included in participant email invitations.</p>
        </div>
        <section className="rounded-2xl border border-[#b8c3a4] bg-white/80 p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 text-[#315247]" size={24} />
            <div>
              <h2 className="text-xl font-semibold text-[#18251f]">{created.title}</h2>
              <p className="mt-1 text-sm text-slate-600">{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(created.date))}</p>
            </div>
          </div>

          {online ? (
            <div className="mt-6 rounded-xl border border-[#b8c3a4] bg-[#f3f5ea] p-5">
              <div className="flex items-center gap-2 font-semibold text-[#18251f]"><Video size={18} /> Online meeting link</div>
              <p className="mt-2 text-sm text-slate-600">This exact link has been sent to participant email invitations and is available in the meeting notifications.</p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#c6cfb8] bg-white px-3 py-2 text-sm text-slate-700">
                  <Link2 size={16} className="shrink-0" />
                  <span className="truncate">{created.conference_url}</span>
                </div>
                <a className="btn btn-primary shrink-0" href={created.conference_url} target="_blank" rel="noreferrer">Join meeting</a>
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-[#d1d4c6] bg-[#f7f7f1] p-5 text-slate-700">
              <div className="flex items-center gap-2 font-semibold"><MapPin size={18} /> Offline meeting</div>
              <p className="mt-2 text-sm">{created.location || "Location not specified"}</p>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={`/meetings/${created.id}`} className="btn btn-secondary">View meeting</Link>
            <Link href="/meetings/new" className="btn btn-primary">Create another</Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">New meeting</h1>
        <p className="mt-2 text-slate-600">Create a governed meeting record and notify participants.</p>
      </div>
      <section className="rounded-2xl border border-[#b8c3a4] bg-white/75 p-6 shadow-sm">
        <form onSubmit={submit} className="space-y-5">
          <label className="block text-sm font-medium text-[#26342e]">Title<input name="title" className="input mt-2" required placeholder="e.g. Faculty Review Meeting" /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-[#26342e]">Date<div className="relative mt-2"><CalendarDays size={17} className="pointer-events-none absolute left-3 top-3 text-slate-500" /><input name="date" className="input pl-10" type="date" required /></div></label>
            <label className="block text-sm font-medium text-[#26342e]">Time<div className="relative mt-2"><Clock3 size={17} className="pointer-events-none absolute left-3 top-3 text-slate-500" /><input name="time" className="input pl-10" type="time" required /></div></label>
          </div>
          <label className="block text-sm font-medium text-[#26342e]">Location<input name="location" className="input mt-2" placeholder={type === "online" ? "Online meeting" : "Room / venue"} disabled={type === "online"} /></label>
          <label className="block text-sm font-medium text-[#26342e]">Meeting type<select name="type" className="select mt-2" value={type} onChange={(event) => setType(event.target.value as "offline" | "online")}><option value="offline">Offline</option><option value="online">Online</option></select></label>
          {type === "online" && (
            <div className="rounded-xl border border-[#b8c3a4] bg-[#f3f5ea] p-4">
              <div className="flex items-center gap-2 font-semibold text-[#315247]"><Video size={17} /> Online meeting link</div>
              <p className="mt-1 text-sm text-slate-600">Paste your Google Meet, Zoom, Microsoft Teams, Jitsi, or any other conference link. If you leave it empty, the system will generate a Jitsi link automatically.</p>
              <input name="conference_url" className="input mt-3 bg-white" type="url" placeholder="https://meet.google.com/..." />
              <p className="mt-2 text-xs text-slate-500">The link you enter will be sent directly to all participant email invitations and included in meeting notifications.</p>
            </div>
          )}
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}
          <button className="btn btn-primary" disabled={saving}>{saving ? "Creating meeting..." : type === "online" ? "Create online meeting" : "Save draft"}</button>
        </form>
      </section>
    </div>
  );
}
