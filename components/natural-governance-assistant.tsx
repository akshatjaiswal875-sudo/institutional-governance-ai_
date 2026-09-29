"use client";

import { FormEvent, useState } from "react";
import { Bot, Send, Sparkles, UserRound } from "lucide-react";

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Request failed");
  return result.data as T;
}

type Message = { role: "user" | "assistant"; content: string };

type ActionDraft = {
  title: string;
  date: string | null;
  location: string | null;
  participantQuery: string;
  topic: string;
};

export function NaturalGovernanceAssistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<ActionDraft | null>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);

  async function ask(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true); setError(""); setQuery("");
    setMessages(prev => [...prev, { role: "user", content: message }]);
    try {
      const result = await api<any>("/api/assistant", { method: "POST", body: JSON.stringify({ message }) });
      setMessages(prev => [...prev, { role: "assistant", content: result.answer ?? "I couldn't find a useful answer." }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Assistant failed.");
    } finally { setBusy(false); }
  }

  async function prepareMeeting(message: string) {
    setBusy(true); setError("");
    try {
      const result = await api<any>("/api/assistant/meeting-action", { method: "POST", body: JSON.stringify({ action: "prepare", message }) });
      if (result.needs?.length) {
        setMessages(prev => [...prev, { role: "assistant", content: `I need ${result.needs.join(" and ")} before I can prepare the meeting.` }]);
      }
      setDraft(result.draft ?? null); setParticipants(result.participants ?? []); setSelected([]);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to prepare meeting."); }
    finally { setBusy(false); }
  }

  async function confirmMeeting() {
    if (!draft || !selected.length || busy) return;
    setBusy(true); setError("");
    try {
      const result = await api<any>("/api/assistant/meeting-action", { method: "POST", body: JSON.stringify({ action: "confirm", draft, participantIds: selected }) });
      setMessages(prev => [...prev, { role: "assistant", content: `Meeting created successfully: ${result.meeting.title}. Invitations were sent to ${result.participants.length} participant(s).` }]);
      setDraft(null); setParticipants([]); setSelected([]);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to create meeting."); }
    finally { setBusy(false); }
  }

  function submit(event: FormEvent) { event.preventDefault(); void ask(query); }

  const suggestions = [
    "Tell me about Trail_02",
    "Summarize my latest meeting",
    "Show pending action items",
    "What decisions were made recently?",
  ];

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
        <div className="card p-5"><h2 className="font-semibold">Admin quick action</h2><p className="mt-2 text-sm text-slate-400">Super Admins can create a meeting by describing it naturally.</p><button onClick={() => { const text = window.prompt("Describe the meeting, e.g. Create a meeting with the Finance Committee tomorrow at 11 AM to discuss the budget."); if (text) void prepareMeeting(text); }} className="btn btn-primary mt-4" disabled={busy}>Create meeting with AI</button></div>
        {draft && <div className="card p-5"><h2 className="font-semibold">Review meeting</h2><div className="mt-3 space-y-2 text-sm"><p><b>Title:</b> {draft.title}</p><p><b>Date:</b> {draft.date ?? "Missing"}</p><p><b>Location:</b> {draft.location ?? "Not specified"}</p><p><b>Participants:</b> {draft.participantQuery || "Not specified"}</p>{draft.topic && <p><b>Agenda:</b> {draft.topic}</p>}</div>{participants.length > 0 && <div className="mt-4 space-y-2">{participants.map(p => <label key={p.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(p.id)} onChange={e => setSelected(v => e.target.checked ? [...v, p.id] : v.filter(id => id !== p.id))}/><span>{p.email}{p.department ? ` · ${p.department}` : ""}</span></label>)}</div>}<button onClick={() => void confirmMeeting()} disabled={busy || !draft.date || !selected.length} className="btn btn-primary mt-4 w-full">Confirm & send invitations</button></div>}
      </aside>
    </div>
  </div>;
}
