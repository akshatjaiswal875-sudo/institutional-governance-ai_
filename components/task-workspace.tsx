"use client";

import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, Clock3, FileText, Upload, UserRound, XCircle } from "lucide-react";

type Task = {
  id: string;
  task: string;
  due_date: string | null;
  priority: string;
  status: "Pending" | "In Progress" | "Completed";
  created_at: string;
  meeting: { id: string; title: string; date: string; location: string | null } | null;
  assignee: { id: string; email: string; role: string; department: string | null } | null;
  creator: { id: string; email: string; role: string } | null;
  reports: { id: string; file_name: string; file_size: number | null; notes: string | null; created_at: string; download_url: string | null }[];
};

const statusIcon = { Pending: Clock3, "In Progress": Clock3, Completed: CheckCircle2 };
const priorityClass: Record<string, string> = { Low: "text-slate-300", Medium: "text-amber-200", High: "text-orange-200", Critical: "text-red-300" };

function formatDate(value: string | null) {
  if (!value) return "No deadline";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(date);
}

function TaskCard({ task, delegated, onRefresh }: { task: Task; delegated: boolean; onRefresh: () => void }) {
  const [status, setStatus] = useState(task.status);
  const [saving, setSaving] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const Icon = statusIcon[task.status];

  async function updateStatus(nextStatus: string) {
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/action-items/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: nextStatus }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to update task.");
      setStatus(nextStatus as Task["status"]);
      setMessage("Task status updated.");
      onRefresh();
    } catch (value) { setError(value instanceof Error ? value.message : "Unable to update task."); }
    finally { setSaving(false); }
  }

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || saving) return;
    setSaving(true); setError(""); setMessage("");
    const form = new FormData(); form.append("file", file); form.append("notes", notes);
    try {
      const response = await fetch(`/api/tasks/${task.id}/report`, { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to submit report.");
      setFile(null); setNotes(""); setUploadOpen(false); setMessage("Report submitted. The task organizer has been notified."); onRefresh();
    } catch (value) { setError(value instanceof Error ? value.message : "Unable to submit report."); }
    finally { setSaving(false); }
  }

  return <article className="rounded-2xl border border-[#81559B]/15 bg-white/[.04] p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#81559B]/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#D8D8F6]">{task.priority}</span><span className="rounded-full bg-[#AAAE7F]/10 px-2.5 py-1 text-[11px] text-[#AAAE7F]">{task.status}</span></div>
        <h2 className="mt-3 text-lg font-semibold text-[#F2F1FF]">{task.task}</h2>
        <p className="mt-1 text-sm text-[#D8D8F6]/55">{task.meeting?.title ?? "Institutional task"}</p>
      </div>
      <Icon size={21} className={task.status === "Completed" ? "text-emerald-300" : "text-[#AAAE7F]"} />
    </div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div><p className="text-[10px] uppercase tracking-wider text-[#D8D8F6]/40">Deadline</p><p className="mt-1 text-sm">{formatDate(task.due_date)}</p></div>
      <div><p className="text-[10px] uppercase tracking-wider text-[#D8D8F6]/40">{delegated ? "Assigned to" : "Assigned by"}</p><p className="mt-1 flex items-center gap-1.5 break-all text-sm"><UserRound size={14} />{delegated ? task.assignee?.email ?? "Unassigned" : task.creator?.email ?? "Unknown"}</p></div>
      <div><p className="text-[10px] uppercase tracking-wider text-[#D8D8F6]/40">Progress</p><p className={`mt-1 text-sm font-medium ${priorityClass[task.priority] ?? ""}`}>{status}</p></div>
      <div><p className="text-[10px] uppercase tracking-wider text-[#D8D8F6]/40">Reports</p><p className="mt-1 text-sm">{task.reports.length} submitted</p></div>
    </div>

    {!delegated && <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-white/[.06] pt-4">
      <select className="select max-w-xs" value={status} disabled={saving} onChange={event => void updateStatus(event.target.value)} aria-label="Task progress"><option>Pending</option><option>In Progress</option><option>Completed</option></select>
      {status === "Completed" && <button type="button" className="btn btn-primary" onClick={() => setUploadOpen(!uploadOpen)}><Upload size={15} />{uploadOpen ? "Close report" : "Submit report"}</button>}
    </div>}

    {uploadOpen && !delegated && <form className="mt-4 space-y-3 rounded-xl border border-[#AAAE7F]/15 bg-[#AAAE7F]/5 p-4" onSubmit={submitReport}>
      <div><label className="block text-sm font-medium">Completion report</label><input className="input mt-1" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt" required onChange={event => setFile(event.target.files?.[0] ?? null)} /></div>
      <textarea className="textarea" value={notes} onChange={event => setNotes(event.target.value)} placeholder="Optional notes for the task organizer" />
      <button className="btn btn-primary" type="submit" disabled={!file || saving}>{saving ? "Submitting..." : "Submit report"}</button>
    </form>}

    {task.reports.length > 0 && <div className="mt-4 border-t border-white/[.06] pt-4"><p className="mb-2 text-sm font-medium"><FileText size={15} className="mr-1 inline" />Submitted reports</p><div className="space-y-2">{task.reports.map(report => <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/[.03] px-3 py-2 text-sm" key={report.id}><div><p>{report.file_name}</p>{report.notes && <p className="text-xs text-[#D8D8F6]/45">{report.notes}</p>}</div>{report.download_url ? <a className="text-xs font-semibold text-[#AAAE7F] hover:underline" href={report.download_url} target="_blank" rel="noreferrer">Open report</a> : <span className="text-xs text-[#D8D8F6]/35">Unavailable</span>}</div>)}</div></div>}
    {message && <p className="mt-3 text-sm text-emerald-300" role="status">{message}</p>}
    {error && <p className="mt-3 text-sm text-red-300" role="alert">{error}</p>}
  </article>;
}

export function TaskWorkspace({ delegated = false }: { delegated?: boolean }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/tasks?view=${delegated ? "delegated" : "workspace"}`, { cache: "no-store" })
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Unable to load tasks."); return result; })
      .then(result => { if (active) { setTasks(result.data ?? []); setError(""); } })
      .catch(value => { if (active) setError(value instanceof Error ? value.message : "Unable to load tasks."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [delegated, refreshKey]);

  if (loading) return <div className="rounded-2xl border border-white/[.06] bg-white/[.03] p-8 text-center text-[#D8D8F6]/55">Loading tasks...</div>;
  if (error) return <div className="rounded-2xl border border-red-400/20 bg-red-400/5 p-6 text-red-200" role="alert">{error}</div>;
  if (!tasks.length) return <div className="rounded-2xl border border-white/[.06] bg-white/[.03] p-10 text-center"><CheckCircle2 className="mx-auto text-[#AAAE7F]" size={28} /><h2 className="mt-3 text-lg font-semibold">{delegated ? "No delegated tasks yet" : "Your workspace is clear"}</h2><p className="mt-1 text-sm text-[#D8D8F6]/50">{delegated ? "Tasks you assign from a meeting will appear here with live progress and reports." : "Tasks assigned to you will appear here with their deadlines and completion reports."}</p></div>;

  const completed = tasks.filter(task => task.status === "Completed").length;
  return <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-white/[.06] bg-white/[.03] p-4"><p className="text-xs text-[#D8D8F6]/45">Total tasks</p><p className="mt-1 text-2xl font-bold">{tasks.length}</p></div><div className="rounded-xl border border-white/[.06] bg-white/[.03] p-4"><p className="text-xs text-[#D8D8F6]/45">In progress</p><p className="mt-1 text-2xl font-bold">{tasks.filter(task => task.status === "In Progress").length}</p></div><div className="rounded-xl border border-white/[.06] bg-white/[.03] p-4"><p className="text-xs text-[#D8D8F6]/45">Completed</p><p className="mt-1 text-2xl font-bold">{completed}</p></div></div><div className="space-y-4">{tasks.map(task => <TaskCard key={task.id} task={task} delegated={delegated} onRefresh={() => setRefreshKey(value => value + 1)} />)}</div></div>;
}
