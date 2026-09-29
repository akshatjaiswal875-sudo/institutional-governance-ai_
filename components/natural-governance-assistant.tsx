"use client";

import { FormEvent, useState } from "react";
import { Bot, CalendarPlus, Send, Sparkles, UserRound, X } from "lucide-react";

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Request failed");
  return result.data as T;
}

type Message = { role: "user" | "assistant"; content: string };
type ActionDraft = { title: string; date: string | null; location: string | null; participantQuery: string; topic: string };

type Participant = { id: string; email: string; role: string; department?: string | null };

export function NaturalGovernanceAssistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<ActionDraft | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [meetingDialogOpen, setMeetingDialogOpen] = useState(false);
  const [meetingPrompt, setMeetingPrompt] = useState("");

  async function ask(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true); setError(""); setQuery("");
    setMessages(prev => [...prev, { role: "user", content: message }]);
    try {
      const result = await api<any>("/api/assistant", { method: "POST", body: JSON.stringify({ message }) });
      setMessages(prev => [...prev, { role: "assistant", content: result.answer ?? "I couldn't find a useful answer." }]);
    } catch (e) { setError(e instanceof Error ? e.message : "Assistant failed."); }
    finally { setBusy(false); }
  }

  async function prepareMeeting(message: string) {
    setBusy(true); setError("");
    try {
      const result = await api<any>("/api/assistant/meeting-action", { method: "POST", body: JSON.stringify({ action: "prepare", message }) });
      if (result.needs?.length) {
        setError(`Meeting needs: ${result.needs.join(", ")}. Try mentioning a date/time and a participant department, role, or email.`);
      }
      setDraft(result.draft ?? null); setParticipants(result.participants ?? []); setSelected([]);
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to prepare meeting."); return false; }
    finally { setBusy(false); }
  }

  async function confirmMeeting() {
    if (!draft || !selected.length || busy) return;
    setBusy(true); setError("");
    try {
      const result = await api<any>("/api/assistant/meeting-action", { method: "POST", body: JSON.stringify({ action: "confirm", draft, participantIds: selected }) });
      const invitationText = result.invitationErrors?.length ? ` ${result.invitationErrors.length} invitation(s) need attention.` : ` Invitations were sent to ${result.participants.length} participant(s).`;
      setMessages(prev => [...prev, { role: "assistant", content: `Meeting created successfully: ${result.meeting.title}.${invitationText}` }]);
      setDraft(null); setParticipants([]); setSelected([]); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to create meeting."); }
    finally { setBusy(false); }
  }

  function submit(event: FormEvent) { event.preventDefault(); void ask(query); }

  const suggestions = ["Tell me about Trail_02", "Summarize my latest meeting", "Show pending action items", "What decisions were made recently?"];

  return <div className="mx-auto max-w-5xl space-y-6">
    <div><h1 className="text-3xl font-semibold">AI Governance Assistant</h1><p className="mt-2 text-slate-400">Talk naturally about meetings, decisions, action items, policies and events.</p></div>
    <div className="grid gap-6 lg:grid-cols-[1fr_330px]">
      <section className="card p-5 min-h-[560px] flex flex-col">
        <div className="flex-1 space-y-4 overflow-auto pr-1">
          {!messages.length && <div className="py-16 text-center"><Sparkles className="mx-auto mb-4" size={34}/><h2 className="text-xl font-semibold">How can I help?</h2><p className="mx-auto mt-2 max-w-lg text-slate-400">Ask in normal language. You don't need exact commands or database terms.</p><div className="mt-6 flex flex-wrap justify-center gap-2">{suggestions.map(s => <button key={s} onClick={() => void ask(s)} className="btn btn-secondary text-sm">{s}</button>)}</div></div>}
          {messages.map((m, i) => <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[85%] rounded-2xl px-4 py-3 whitespace-pre-wrap ${m.role === "user" ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-100"}`}>{m.role === "user" ? <UserRound className="mb-1 inline mr-2" size={15}/> : <Bot className="mb-1 inline mr-2" size={15}/>} {m.content}</div></div>)}
          {busy && <div className="text-sm text-slate-400">Assistant is thinking...</div>}
        </div>
        {error && <p className="mb-3 text-sm text-red-400" role="alert">{error}</p>}
        <form onSubmit={submit} className="mt-4 flex gap-2"><input value={query} onChange={e => setQuery(e.target.value)} className="input flex-1" placeholder="Ask anything about your institution..." disabled={busy}/><button className="btn btn-primary" disabled={busy || !query.trim()}><Send size={16}/></button></form>
      </section>
      <aside className="space-y-4">
        <div className="card p-5"><h2 className="font-semibold">Admin quick action</h2><p className="mt-2 text-sm text-slate-400">Super Admins can create a meeting by describing it naturally.</p><button onClick={() => { setError(""); setMeetingDialogOpen(true); }} className="btn btn-primary mt-4 inline-flex items-center gap-2" disabled={busy}><CalendarPlus size={17}/>Create meeting with AI</button></div>
        {draft && <div className="card p-5"><h2 className="font-semibold">Review meeting</h2><div className="mt-3 space-y-2 text-sm"><p><b>Title:</b> {draft.title}</p><p><b>Date:</b> {draft.date ?? "Missing"}</p><p><b>Location:</b> {draft.location ?? "Not specified"}</p><p><b>Participants:</b> {draft.participantQuery || "Not specified"}</p>{draft.topic && <p><b>Agenda:</b> {draft.topic}</p>}</div>{participants.length > 0 && <div className="mt-4 max-h-48 space-y-2 overflow-auto">{participants.map(p => <label key={p.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(p.id)} onChange={e => setSelected(v => e.target.checked ? [...v, p.id] : v.filter(id => id !== p.id))}/><span>{p.email}{p.department ? ` · ${p.department}` : ""}</span></label>)}</div>}{participants.length === 0 && draft.participantQuery && <p className="mt-4 text-sm text-amber-300">No matching participant was found. Try a department such as Faculty or an exact user email.</p>}<button onClick={() => void confirmMeeting()} disabled={busy || !draft.date || !selected.length} className="btn btn-primary mt-4 w-full">Confirm & send invitations</button></div>}
      </aside>
    </div>

    {meetingDialogOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="meeting-dialog-title" onMouseDown={e => { if (e.target === e.currentTarget && !busy) setMeetingDialogOpen(false); }}>
      <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-950 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4"><div><h2 id="meeting-dialog-title" className="text-xl font-semibold">Create meeting with AI</h2><p className="mt-1 text-sm text-slate-400">Describe the meeting naturally. AI will extract the date, time, topic, location and participant search.</p></div><button type="button" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white" onClick={() => setMeetingDialogOpen(false)} disabled={busy} aria-label="Close"><X size={20}/></button></div>
        <textarea autoFocus value={meetingPrompt} onChange={e => setMeetingPrompt(e.target.value)} className="input mt-5 min-h-36 w-full resize-y" placeholder="Example: Create a meeting with Faculty tomorrow at 11 AM at AV Hall to discuss the annual budget." disabled={busy}/>
        <div className="mt-3 rounded-lg bg-slate-900 p-3 text-xs text-slate-400">Tip: use a participant department (Faculty), supported role (Member), or exact email. The system will show the matching users before anything is created.</div>
        <div className="mt-5 flex justify-end gap-3"><button type="button" className="btn btn-secondary" onClick={() => setMeetingDialogOpen(false)} disabled={busy}>Cancel</button><button type="button" className="btn btn-primary" onClick={async () => { if (!meetingPrompt.trim()) return; const ok = await prepareMeeting(meetingPrompt); if (ok) setMeetingDialogOpen(false); }} disabled={busy || !meetingPrompt.trim()}>{busy ? "Preparing..." : "Generate meeting draft"}</button></div>
      </div>
    </div>}
  </div>;
}
