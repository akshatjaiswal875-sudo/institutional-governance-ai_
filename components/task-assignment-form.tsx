"use client";

import { FormEvent, useEffect, useState } from "react";

type DirectoryUser = { id: string; email: string; role: string; department: string | null };

export function TaskAssignmentForm({ meetingId, onSaved }: { meetingId: string; onSaved: () => void }) {
  const [task, setTask] = useState("");
  const [departments, setDepartments] = useState<string[]>([]);
  const [department, setDepartment] = useState("");
  const [role, setRole] = useState("Faculty / Officer");
  const [assignees, setAssignees] = useState<DirectoryUser[]>([]);
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [saving, setSaving] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    fetch(`/api/meetings/${meetingId}/participants`)
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Unable to load departments."); setDepartments(result.data?.departments ?? []); })
      .catch(value => setError(value instanceof Error ? value.message : "Unable to load departments."));
  }, [meetingId]);

  useEffect(() => {
    if ((role === "HOD" || role === "Faculty / Officer") && !department) { setAssignees([]); setAssigneeId(""); return; }
    let cancelled = false;
    setLoadingUsers(true); setError(""); setAssigneeId("");
    const params = new URLSearchParams({ role });
    if (department) params.set("department", department);
    fetch(`/api/meetings/${meetingId}/participants?${params.toString()}`)
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Unable to load eligible members."); if (!cancelled) setAssignees(result.data?.users ?? []); })
      .catch(value => { if (!cancelled) setError(value instanceof Error ? value.message : "Unable to load eligible members."); })
      .finally(() => { if (!cancelled) setLoadingUsers(false); });
    return () => { cancelled = true; };
  }, [meetingId, department, role]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !assigneeId) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      const response = await fetch(`/api/meetings/${meetingId}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task, assigneeId, department, role, dueDate, priority }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to assign task.");
      setTask(""); setAssigneeId(""); setDueDate(""); setPriority("Medium");
      setSuccess(`Task assigned to ${result.data.assignee.email} (${result.data.assignee.role}).`); onSaved();
    } catch (value) { setError(value instanceof Error ? value.message : "Unable to assign task."); }
    finally { setSaving(false); }
  }

  const needsDepartment = role === "HOD" || role === "Faculty / Officer";
  return <form className="space-y-4" onSubmit={submit}>
    <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/5 p-3 text-sm text-slate-300">Choose a role and, for HOD or faculty, a department. Only matching registered accounts will be shown.</div>
    <label className="block text-sm text-slate-300"><span className="mb-1 block">Task</span><textarea className="textarea" value={task} onChange={event => setTask(event.target.value)} placeholder="Describe exactly what must be completed" required /></label>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-sm text-slate-300"><span className="mb-1 block">Role</span><select className="select" value={role} onChange={event => setRole(event.target.value)}><option value="Faculty / Officer">Faculty</option><option value="HOD">HOD</option><option value="Director">Director</option><option value="Principal">Principal</option><option value="Super Admin">Super Admin</option><option value="Meeting Secretary">Meeting Secretary</option></select></label>
      <label className="block text-sm text-slate-300"><span className="mb-1 block">Department</span><select className="select" value={department} onChange={event => setDepartment(event.target.value)} disabled={!needsDepartment}><option value="">{needsDepartment ? "Select department first" : "Not required for this role"}</option>{departments.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
    </div>
    <label className="block text-sm text-slate-300"><span className="mb-1 block">Eligible assignee</span><select className="select" value={assigneeId} onChange={event => setAssigneeId(event.target.value)} required disabled={loadingUsers || (needsDepartment && !department) || !assignees.length}><option value="">{loadingUsers ? "Loading members..." : needsDepartment && !department ? "Select a department first" : assignees.length ? "Select an eligible member" : "No matching accounts found"}</option>{assignees.map(user => <option key={user.id} value={user.id}>{user.email} · {user.role}</option>)}</select></label>
    <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm text-slate-300"><span className="mb-1 block">Deadline</span><input className="input" type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} required /></label><label className="block text-sm text-slate-300"><span className="mb-1 block">Priority</span><select className="select" value={priority} onChange={event => setPriority(event.target.value)}><option>Low</option><option>Medium</option><option>High</option><option>Critical</option></select></label></div>
    <button className="btn btn-primary w-full" type="submit" disabled={saving || !assigneeId || loadingUsers}>{saving ? "Assigning..." : "Assign task"}</button>
    {success && <p className="text-sm text-emerald-300" role="status">{success}</p>}
    {error && <p className="text-sm text-red-300" role="alert">{error}</p>}
  </form>;
}
