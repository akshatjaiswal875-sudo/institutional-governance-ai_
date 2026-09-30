"use client";

import { FormEvent, useState } from "react";

export function TaskAssignmentForm({ meetingId, onSaved }: { meetingId: string; onSaved: () => void }) {
  const [task, setTask] = useState("");
  const [assigneeEmail, setAssigneeEmail] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      const response = await fetch(`/api/meetings/${meetingId}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task, assigneeEmail, dueDate, priority }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to assign task.");
      setTask(""); setAssigneeEmail(""); setDueDate(""); setPriority("Medium"); setSuccess(`Task assigned to ${result.data.assignee.email}.`); onSaved();
    } catch (value) { setError(value instanceof Error ? value.message : "Unable to assign task."); }
    finally { setSaving(false); }
  }

  return <form className="space-y-4" onSubmit={submit}>
    <div className="rounded-xl border border-[#AAAE7F]/15 bg-[#AAAE7F]/5 p-3 text-sm text-slate-300">The task will be assigned using the member's email. Only the organizer of this meeting can assign it.</div>
    <label className="block text-sm text-slate-300"><span className="mb-1 block">Task</span><textarea className="textarea" value={task} onChange={event => setTask(event.target.value)} placeholder="Describe exactly what must be completed" required /></label>
    <label className="block text-sm text-slate-300"><span className="mb-1 block">Assignee email</span><input className="input" type="email" value={assigneeEmail} onChange={event => setAssigneeEmail(event.target.value)} placeholder="member@institution.edu" required /></label>
    <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm text-slate-300"><span className="mb-1 block">Deadline</span><input className="input" type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} required /></label><label className="block text-sm text-slate-300"><span className="mb-1 block">Priority</span><select className="select" value={priority} onChange={event => setPriority(event.target.value)}><option>Low</option><option>Medium</option><option>High</option><option>Critical</option></select></label></div>
    <button className="btn btn-primary w-full" type="submit" disabled={saving}>{saving ? "Assigning..." : "Assign task"}</button>
    {success && <p className="text-sm text-emerald-300" role="status">{success}</p>}
    {error && <p className="text-sm text-red-300" role="alert">{error}</p>}
  </form>;
}
