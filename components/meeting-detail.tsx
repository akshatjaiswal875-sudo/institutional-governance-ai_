"use client";

import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { FileText, UserPlus, X } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { MeetingIntelligence } from "@/components/meeting-intelligence";
import { ParticipantSelector, WorkflowActions } from "@/components/meeting-actions";

type ParticipantOption = { id: string; email: string; role: string; department?: string | null };
type MeetingRecord = {
  meeting: any;
  participants: any[];
  agenda: any[];
  minutes: any[];
  decisions: any[];
  actions: any[];
};

const dateText = (value?: string | null) => {
  if (!value) return "Date not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date not available" : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(date);
};

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Request failed.");
  return result.data as T;
}

function Modal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  return <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/75 p-4"><div className="w-full max-w-xl rounded-xl border border-slate-700 bg-slate-900 p-5"><div className="mb-4 flex justify-between"><h2 className="text-lg font-semibold">{title}</h2><button type="button" onClick={close} aria-label="Close"><X size={18} /></button></div>{children}</div></div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm text-slate-300"><span className="mb-1 block">{label}</span>{children}</label>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <Card><p className="text-xs uppercase text-slate-500">{label}</p><p className="mt-2 break-words">{value}</p></Card>;
}

function userLabel(user: any) {
  return user?.email ?? "Unknown participant";
}

const ACTION_STATUSES = ["Pending", "In Progress", "Completed"] as const;

export function MeetingDetailView() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [record, setRecord] = useState<MeetingRecord | null>(null);
  const [options, setOptions] = useState<ParticipantOption[]>([]);
  const [currentRole, setCurrentRole] = useState("Member");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [modal, setModal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [updatingAction, setUpdatingAction] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [meetingData, userData] = await Promise.all([
        api<MeetingRecord>(`/api/meetings/${params.id}`),
        api<{ users: ParticipantOption[]; currentRole: string }>(`/api/meetings/${params.id}/participants`),
      ]);
      setRecord(meetingData);
      setOptions(userData.users);
      setCurrentRole(userData.currentRole);
      setError("");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Unable to load meeting.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [params.id]);

  async function submit(url: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      await api(url, { method: "POST", body: JSON.stringify(body) });
      setMessage("Saved successfully.");
      setModal(null);
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Operation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function updateActionStatus(actionId: string, status: string) {
    setUpdatingAction(actionId);
    setError("");
    setMessage("");
    try {
      await api(`/api/action-items/${actionId}`, { method: "PATCH", body: JSON.stringify({ status }) });
      setMessage("Action item status updated.");
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Unable to update action item.");
    } finally {
      setUpdatingAction(null);
    }
  }

  async function removeParticipant(participantId: string) {
    if (!window.confirm("Remove this participant from the meeting?")) return;
    try {
      await api(`/api/meetings/${params.id}/participants`, { method: "DELETE", body: JSON.stringify({ participantId }) });
      setMessage("Participant removed.");
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Unable to remove participant.");
    }
  }

  async function inviteParticipant(participantId: string) {
    try {
      await api(`/api/meetings/${params.id}/participants/invite`, { method: "POST", body: JSON.stringify({ participantId }) });
      setMessage("Invitation sent.");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Unable to send invitation.");
    }
  }

  async function deleteMeeting() {
    if (!record || !window.confirm("Delete this meeting and its related records?")) return;
    try {
      await api(`/api/meetings/${params.id}`, { method: "DELETE" });
      router.replace("/meetings");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Unable to delete meeting.");
    }
  }

  if (loading) return <p className="text-slate-400">Loading meeting...</p>;
  if (!record) return <p className="text-red-400" role="alert">{error || "Meeting not found."}</p>;
  const meeting = record.meeting;
  const existingIds = record.participants.map(participant => participant.user_id);

  return <div className="space-y-6">
    {message && <p className="text-emerald-300" role="status">{message}</p>}
    {error && <p className="text-red-400" role="alert">{error}</p>}
    <div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-semibold">{meeting.title}</h1><p className="mt-2 text-slate-400">{dateText(meeting.date)} · {meeting.location ?? "Remote"}</p></div><div className="flex flex-wrap gap-2"><Link href="/meetings" className="btn btn-secondary">Back</Link><Link href={`/meetings/${meeting.id}/edit`} className="btn btn-primary">Edit meeting</Link><button type="button" className="btn btn-secondary" onClick={() => void deleteMeeting()}>Delete meeting</button></div></div>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Info label="Date" value={dateText(meeting.date)} /><Info label="Location" value={meeting.location ?? "Remote"} /><Info label="Type" value={meeting.type} /><Info label="Status" value={meeting.status} /><Info label="Organizer" value={meeting.creator?.email ?? meeting.created_by} /><Info label="Assigned approver" value={meeting.assigned_approver?.email ?? "Not assigned"} /></div>
    <MeetingIntelligence meetingId={meeting.id} />
    <Card><div className="flex flex-wrap gap-2"><button className="btn btn-secondary" onClick={() => setModal("participant")}><UserPlus size={15} /> Add participant</button><button className="btn btn-secondary" onClick={() => setModal("agenda")}>Add agenda</button><button className="btn btn-secondary" onClick={() => setModal("minutes")}><FileText size={15} /> Add minutes</button><button className="btn btn-secondary" onClick={() => setModal("decision")}>Add decision</button><button className="btn btn-secondary" onClick={() => setModal("action")}>Add action item</button></div><div className="mt-4"><WorkflowActions meetingId={meeting.id} status={meeting.status} assignedApproverId={meeting.assigned_approver_id} approvers={options.filter(option => option.role === "Faculty / Officer")} role={currentRole} /></div></Card>
    <div className="grid gap-6 lg:grid-cols-2"><Card><h2 className="mb-4 text-lg font-semibold">Participants</h2>{record.participants.length ? record.participants.map(participant => <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 py-2" key={participant.id}><div><p>{userLabel(participant.users)}</p><p className="text-sm text-slate-400">{participant.users?.department ?? participant.users?.role ?? "Participant"} · {participant.attendance_status}</p></div><div className="flex gap-2"><button type="button" className="btn btn-secondary text-xs" onClick={() => void inviteParticipant(participant.id)}>Invite</button><button type="button" className="btn btn-secondary text-xs" onClick={() => void removeParticipant(participant.id)}>Remove</button></div></div>) : <p className="text-slate-400">No participants added.</p>}</Card><Card><h2 className="mb-4 text-lg font-semibold">Agenda</h2>{record.agenda.length ? record.agenda.map(item => <p className="border-b border-slate-800 py-2" key={item.id}>{item.sort_order + 1}. {item.topic}</p>) : <p className="text-slate-400">No agenda items.</p>}</Card><Card><h2 className="mb-4 text-lg font-semibold">Minutes</h2>{record.minutes.length ? record.minutes.map(minute => <div className="border-b border-slate-800 py-3" key={minute.id}><Badge>Version {minute.version}</Badge><p className="mt-3 whitespace-pre-wrap text-slate-300">{minute.raw_transcript}</p></div>) : <p className="text-slate-400">No minutes recorded.</p>}</Card><Card><h2 className="mb-4 text-lg font-semibold">Decisions</h2>{record.decisions.length ? record.decisions.map(decision => <p className="border-b border-slate-800 py-2" key={decision.id}>{decision.decision_text} · {decision.status}</p>) : <p className="text-slate-400">No decisions recorded.</p>}</Card><Card><h2 className="mb-4 text-lg font-semibold">Action items</h2>{record.actions.length ? record.actions.map(item => <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 py-3" key={item.id}><div className="min-w-0 flex-1"><p className="font-medium">{item.task}</p><p className="mt-1 text-sm text-slate-400">Current status: {item.status}{item.due_date ? ` · Due ${item.due_date}` : ""}{item.priority ? ` · ${item.priority}` : ""}</p></div><select aria-label={`Change status for ${item.task}`} className="select w-auto min-w-36" value={item.status} disabled={updatingAction === item.id} onChange={event => void updateActionStatus(item.id, event.target.value)}>{ACTION_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}</select></div>) : <p className="text-slate-400">No action items recorded.</p>}</Card></div>
    {modal === "participant" && <Modal title="Add participants" close={() => setModal(null)}><ParticipantSelector meetingId={meeting.id} options={options} existingIds={existingIds} onSaved={() => { setModal(null); void load(); }} /></Modal>}
    {modal === "agenda" && <Modal title="Add agenda" close={() => setModal(null)}><form className="space-y-4" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void submit(`/api/meetings/${meeting.id}/agenda`, { topic: form.get("topic"), presenter: form.get("presenter"), durationMinutes: form.get("duration") }); }}><Field label="Topic"><input name="topic" className="input" required /></Field><Field label="Presenter"><input name="presenter" className="input" /></Field><Field label="Duration minutes"><input name="duration" className="input" type="number" /></Field><button className="btn btn-primary" disabled={busy}>Save</button></form></Modal>}
    {modal === "minutes" && <Modal title="Add minutes" close={() => setModal(null)}><form className="space-y-4" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void submit(`/api/meetings/${meeting.id}/minutes`, { rawTranscript: form.get("minutes"), summary: form.get("summary") }); }}><Field label="Minutes / transcript"><textarea name="minutes" className="textarea" required /></Field><Field label="Summary"><textarea name="summary" className="textarea" /></Field><button className="btn btn-primary" disabled={busy}>Save</button></form></Modal>}
    {modal === "decision" && <Modal title="Add decision" close={() => setModal(null)}><form className="space-y-4" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void submit(`/api/meetings/${meeting.id}/decisions`, { decisionText: form.get("decision"), actionItem: form.get("action") }); }}><Field label="Decision"><textarea name="decision" className="textarea" required /></Field><Field label="Action item"><input name="action" className="input" /></Field><button className="btn btn-primary" disabled={busy}>Save</button></form></Modal>}
    {modal === "action" && <Modal title="Add action item" close={() => setModal(null)}><form className="space-y-4" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void submit(`/api/meetings/${meeting.id}/actions`, { task: form.get("task"), dueDate: form.get("dueDate"), priority: form.get("priority") }); }}><Field label="Task"><input name="task" className="input" required /></Field><Field label="Due date"><input name="dueDate" className="input" type="date" /></Field><Field label="Priority"><select name="priority" className="select"><option>Medium</option><option>High</option><option>Critical</option></select></Field><button className="btn btn-primary" disabled={busy}>Save</button></form></Modal>}
  </div>;
}