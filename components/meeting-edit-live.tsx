"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card } from "@/components/ui";

export default function MeetingEditLive() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [meeting, setMeeting] = useState<any>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [type, setType] = useState<"online" | "offline">("offline");
  const [approver, setApprover] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/meetings/${params.id}`).then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Unable to load meeting.");
        return result.data.meeting;
      }),
      fetch(`/api/meetings/${params.id}/participants`).then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Unable to verify meeting ownership.");
        return result.data.currentUserId as string;
      }),
    ])
      .then(([data, currentUserId]) => {
        if (data.created_by !== currentUserId) throw new Error("Only the person who created this meeting can edit it.");
        setMeeting(data);
        setTitle(data.title ?? "");
        setDate(data.date ? new Date(data.date).toISOString().slice(0, 16) : "");
        setLocation(data.location ?? "");
        setType(data.type === "online" ? "online" : "offline");
        setApprover(data.assigned_approver_id ?? "");
      })
      .catch(errorValue => setError(errorValue instanceof Error ? errorValue.message : "Unable to load meeting."));
  }, [params.id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !date || saving) {
      setError("Title and date are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/meetings/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), date: new Date(date).toISOString(), location, type, assignedApproverId: approver }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to update meeting.");
      router.push(`/meetings/${params.id}`);
      router.refresh();
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : "Unable to update meeting.");
    } finally {
      setSaving(false);
    }
  }

  if (error && !meeting) return <p className="text-red-400" role="alert">{error}</p>;
  if (!meeting) return <p className="text-slate-400">Loading meeting...</p>;

  return <div className="mx-auto max-w-3xl space-y-6"><div><h1 className="text-3xl font-semibold">Edit meeting</h1><p className="mt-2 text-slate-400">Update the existing meeting record.</p></div><Card><form onSubmit={submit} className="space-y-4"><label className="block text-sm text-slate-300">Title<input className="input mt-1" value={title} onChange={event => setTitle(event.target.value)} required /></label><label className="block text-sm text-slate-300">Date and time<input className="input mt-1" type="datetime-local" value={date} onChange={event => setDate(event.target.value)} required /></label><label className="block text-sm text-slate-300">Location<input className="input mt-1" value={location} onChange={event => setLocation(event.target.value)} /></label><label className="block text-sm text-slate-300">Meeting type<select className="select mt-1" value={type} onChange={event => setType(event.target.value as "online" | "offline")}><option value="offline">Offline</option><option value="online">Online</option></select></label><label className="block text-sm text-slate-300">Assigned approver<input className="input mt-1" value={approver} onChange={event => setApprover(event.target.value)} placeholder="Approver email" /></label><div className="flex gap-3"><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Saving..." : "Save changes"}</button><button className="btn btn-secondary" type="button" onClick={() => router.push(`/meetings/${params.id}`)}>Cancel</button></div>{error && <p className="text-red-400" role="alert">{error}</p>}</form></Card></div>;
}
