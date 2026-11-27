"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ParticipantOption = {
	id: string;
	email: string;
	role: string;
	department?: string | null;
};

export function ParticipantSelector({
  meetingId,
  existingIds,
  departments,
  onSaved,
}: {
  meetingId: string;
  options?: ParticipantOption[];
  existingIds: string[];
  departments: string[];
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [department, setDepartment] = useState("");
  const [role, setRole] = useState("Faculty / Officer");
  const [users, setUsers] = useState<ParticipantOption[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const needsDepartment = role === "HOD" || role === "Faculty / Officer" || role === "Faculty";

  useEffect(() => {
    if (needsDepartment && !department) { setUsers([]); setSelected([]); return; }
    let cancelled = false;
    const params = new URLSearchParams({ role });
    if (department) params.set("department", department);
    setLoading(true); setError(""); setSelected([]);
    fetch(`/api/meetings/${meetingId}/participants?${params.toString()}`)
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Unable to load eligible users."); if (!cancelled) setUsers(result.data?.users ?? []); })
      .catch(value => { if (!cancelled) setError(value instanceof Error ? value.message : "Unable to load eligible users."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [meetingId, role, department, needsDepartment]);

  const available = users.filter(option => !existingIds.includes(option.id) && !selected.includes(option.id) && `${option.email} ${option.role} ${option.department ?? ""}`.toLowerCase().includes(query.toLowerCase()));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected.length || saving) return;
    setSaving(true); setError("");
    try {
      for (const userId of selected) {
        const response = await fetch(`/api/meetings/${meetingId}/participants`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, attendanceStatus: "Invited" }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Could not add participant.");
      }
      setSelected([]); onSaved();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Could not add participant.");
    } finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm text-slate-300">Role
          <select className="select mt-1" value={role} onChange={event => setRole(event.target.value)}>
            <option value="Faculty / Officer">Faculty</option><option value="HOD">HOD</option><option value="Director">Director</option><option value="Principal">Principal</option><option value="Super Admin">Super Admin</option><option value="Meeting Secretary">Meeting Secretary</option>
          </select>
        </label>
        <label className="block text-sm text-slate-300">Department
          <select className="select mt-1" value={department} onChange={event => setDepartment(event.target.value)} disabled={!needsDepartment}>
            <option value="">{needsDepartment ? "Select department" : "Not required"}</option>
            {departments.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
      </div>
      <label className="block text-sm text-slate-300">Search eligible members
        <input className="input mt-1" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search within the selected role and department" />
      </label>
      <select className="select" value="" onChange={event => { if (event.target.value) setSelected(current => [...current, event.target.value]); }} disabled={loading || !available.length}>
        <option value="">{loading ? "Loading eligible members..." : available.length ? "Choose a participant" : needsDepartment && !department ? "Choose a department first" : "No matching members available"}</option>
        {available.map(option => <option key={option.id} value={option.id}>{option.email} ({option.role})</option>)}
      </select>
      {selected.length > 0 && <div className="flex flex-wrap gap-2"><span className="w-full text-sm text-slate-400">Selected participants</span>{selected.map(id => { const option = users.find(item => item.id === id); return <span className="inline-flex items-center gap-2 rounded-full border border-slate-700 px-3 py-1 text-sm" key={id}>{option?.email ?? id}<button type="button" aria-label={`Remove ${option?.email ?? "participant"}`} onClick={() => setSelected(current => current.filter(item => item !== id))}>×</button></span>; })}</div>}
      <button className="btn btn-primary" type="submit" disabled={saving || !selected.length}>{saving ? "Adding..." : "Save participants"}</button>
      {error && <p className="text-red-400" role="alert">{error}</p>}
    </form>
  );
}

export function ParticipantActions({
	meetingId,
	options,
}: {
	meetingId: string;
	options: ParticipantOption[];
}) {
	const [open, setOpen] = useState(false);
	const [userId, setUserId] = useState(options[0]?.id ?? "");
	const [attendanceStatus, setAttendanceStatus] = useState("Invited");
	const [error, setError] = useState("");
	const [saving, setSaving] = useState(false);
	const router = useRouter();

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!userId || saving) return;
		setSaving(true);
		setError("");
		try {
			const response = await fetch(`/api/meetings/${meetingId}/participants`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ userId, attendanceStatus }),
			});
			const result = await response.json();
			if (!response.ok) {
				setError(result.error ?? "Could not add participant.");
				return;
			}
			setOpen(false);
			router.refresh();
		} catch {
			setError("Could not add participant. Please try again.");
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="space-y-3">
			<button type="button" className="btn btn-secondary" onClick={() => setOpen(!open)}>
				{open ? "Cancel" : "Add participant"}
			</button>
			{open && (
				<form onSubmit={submit} className="rounded-lg border border-slate-800 p-4 space-y-3">
					<label className="block text-sm text-slate-300">
						Participant
						{options.length ? (
							<select className="select mt-1" value={userId} onChange={(event) => setUserId(event.target.value)} required>
								<option value="">Select a user</option>
								{options.map((option) => (
									<option key={option.id} value={option.id}>
										{option.email} ({option.role})
									</option>
								))}
							</select>
						) : (
							<p className="mt-1 text-sm text-slate-400">No participant accounts are available.</p>
						)}
					</label>
					<label className="block text-sm text-slate-300">
						Attendance status
						<select className="select mt-1" value={attendanceStatus} onChange={(event) => setAttendanceStatus(event.target.value)}>
							<option>Invited</option>
							<option>Present</option>
							<option>Absent</option>
						</select>
					</label>
					<button className="btn btn-primary" type="submit" disabled={saving}>
						{saving ? "Adding..." : "Save participant"}
					</button>
					{error && <p className="text-red-400" role="alert">{error}</p>}
				</form>
			)}
		</div>
	);
}

export function MinutesActions({ meetingId }: { meetingId: string }) {
	const [open, setOpen] = useState(false);
	const [transcript, setTranscript] = useState("");
	const [summary, setSummary] = useState("");
	const [error, setError] = useState("");
	const [saving, setSaving] = useState(false);
	const [success, setSuccess] = useState("");
	const router = useRouter();

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!transcript.trim() || saving) return;
		setSaving(true);
		setError("");
		setSuccess("");
		try {
			const response = await fetch(`/api/meetings/${meetingId}/minutes`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ rawTranscript: transcript, summary }),
			});
			const result = await response.json();
			if (!response.ok) {
				setError(result.error ?? "Could not save minutes.");
				return;
			}
			setTranscript("");
			setSummary("");
			setOpen(false);
			setSuccess("Minutes saved.");
			router.refresh();
		} catch {
			setError("Could not save minutes. Please try again.");
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="space-y-3">
			<button type="button" className="btn btn-secondary" onClick={() => setOpen(!open)}>
				{open ? "Cancel" : "Add minutes"}
			</button>
			{success && <p className="text-emerald-400" role="status">{success}</p>}
			{open && (
				<form onSubmit={submit} className="rounded-lg border border-slate-800 p-4 space-y-3">
					<label className="block text-sm text-slate-300">
						Minutes or transcript
						<textarea className="textarea mt-1" value={transcript} onChange={(event) => setTranscript(event.target.value)} required placeholder="Paste the meeting minutes or transcript" />
					</label>
					<label className="block text-sm text-slate-300">
						Summary (optional)
						<textarea className="textarea mt-1" value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Add a concise summary" />
					</label>
					<button className="btn btn-primary" type="submit" disabled={saving}>
						{saving ? "Saving..." : "Save minutes"}
					</button>
					{error && <p className="text-red-400" role="alert">{error}</p>}
				</form>
			)}
		</div>
	);
}

export function DecisionActions({
	meetingId,
	assignees,
}: {
	meetingId: string;
	assignees: ParticipantOption[];
}) {
	const [open, setOpen] = useState(false);
	const [decisionText, setDecisionText] = useState("");
	const [actionItem, setActionItem] = useState("");
	const [assigneeId, setAssigneeId] = useState("");
	const [dueDate, setDueDate] = useState("");
	const [status, setStatus] = useState("Pending");
	const [error, setError] = useState("");
	const [saving, setSaving] = useState(false);
	const router = useRouter();

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!decisionText.trim() || saving) return;
		setSaving(true);
		setError("");
		try {
			const response = await fetch(`/api/meetings/${meetingId}/decisions`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ decisionText, actionItem, assigneeId, dueDate, status }),
			});
			const result = await response.json();
			if (!response.ok) {
				setError(result.error ?? "Could not add decision.");
				return;
			}
			setOpen(false);
			setDecisionText("");
			setActionItem("");
			router.refresh();
		} catch {
			setError("Could not add decision. Please try again.");
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="space-y-3">
			<button type="button" className="btn btn-secondary" onClick={() => setOpen(!open)}>
				{open ? "Cancel" : "Add decision"}
			</button>
			{open && (
				<form onSubmit={submit} className="rounded-lg border border-slate-800 p-4 space-y-3">
					<textarea className="textarea" value={decisionText} onChange={(event) => setDecisionText(event.target.value)} placeholder="Decision text" required />
					<textarea className="textarea" value={actionItem} onChange={(event) => setActionItem(event.target.value)} placeholder="Action item (optional)" />
					<div className="grid gap-3 sm:grid-cols-3">
						<select className="select" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
							<option value="">No assignee</option>
							{assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.email}</option>)}
						</select>
						<input className="input" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
						<select className="select" value={status} onChange={(event) => setStatus(event.target.value)}><option>Pending</option><option>In Progress</option><option>Completed</option></select>
					</div>
					<button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Saving..." : "Save decision"}</button>
					{error && <p className="text-red-400" role="alert">{error}</p>}
				</form>
			)}
		</div>
	);
}

export function WorkflowActions({
	meetingId,
	status,
	assignedApproverId,
	approvers,
	role,
}: {
	meetingId: string;
	status: string;
	assignedApproverId: string | null;
	approvers: ParticipantOption[];
	role: string;
}) {
	const [approverId, setApproverId] = useState(assignedApproverId ?? "");
	const [error, setError] = useState("");
	const [saving, setSaving] = useState(false);
	const router = useRouter();
	const canAssign = role === "Super Admin" || role === "Meeting Secretary";

	async function act(action: string) {
		if (saving) return;
		setSaving(true);
		setError("");
		try {
			const response = await fetch(`/api/meetings/${meetingId}/workflow`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
								body: JSON.stringify({ action, approverId, approverEmail: approvers.find(item => item.id === approverId)?.email }),
			});
			const result = await response.json();
			if (!response.ok) {
				setError(result.error ?? "Workflow action failed.");
				return;
			}
			router.refresh();
		} catch {
			setError("Workflow action failed. Please try again.");
		} finally {
			setSaving(false);
		}
	}

	return (
		<Cardless>
			{canAssign && (
				<div className="flex flex-wrap gap-2">
					<select className="select max-w-xs" value={approverId} onChange={(event) => setApproverId(event.target.value)}>
						<option value="">Select Faculty / Officer</option>
						{approvers.map((approver) => <option key={approver.id} value={approver.id}>{approver.email}</option>)}
					</select>
					<button type="button" className="btn btn-secondary" onClick={() => act("assign")} disabled={saving || !approverId}>Assign approver</button>
				</div>
			)}
			{canAssign && ["Draft", "Rejected", "Transcribed"].includes(status) && <button type="button" className="btn btn-primary" onClick={() => act("submit")} disabled={saving || !assignedApproverId}>Submit for approval</button>}
			{(role === "Super Admin" || role === "Faculty / Officer") && status === "Pending Approval" && <><button type="button" className="btn btn-primary" onClick={() => act("approve")} disabled={saving}>Approve</button><button type="button" className="btn btn-secondary" onClick={() => act("reject")} disabled={saving}>Reject</button></>}
			{role === "Super Admin" && status === "Approved" && <button type="button" className="btn btn-primary" onClick={() => act("publish")} disabled={saving}>Publish</button>}
			{error && <p className="w-full text-red-400" role="alert">{error}</p>}
		</Cardless>
	);
}

function Cardless({ children }: { children: React.ReactNode }) {
	return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}
