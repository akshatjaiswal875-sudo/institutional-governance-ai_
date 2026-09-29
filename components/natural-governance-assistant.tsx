"use client";

import { FormEvent, ReactNode, useState } from "react";
import { Bot, CalendarPlus, Check, Send, Sparkles, UserRound, X } from "lucide-react";

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Request failed");
  return result.data as T;
}

type Message = { role: "user" | "assistant"; content: string };
type ActionDraft = { title: string; date: string | null; location: string | null; participantQuery: string; topic: string };
type Participant = { id: string; email: string; role: string; department?: string | null };

function inlineMarkdown(text: string): ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g).filter(Boolean);
  return tokens.map((token, index) => {
    if (token.startsWith("**") && token.endsWith("**")) return <strong key={index} className="font-semibold text-white">{token.slice(2, -2)}</strong>;
    if (token.startsWith("`") && token.endsWith("`")) return <code key={index} className="rounded bg-slate-950/70 px-1.5 py-0.5 text-[0.9em] text-cyan-200">{token.slice(1, -1)}</code>;
    if (token.startsWith("*") && token.endsWith("*")) return <em key={index}>{token.slice(1, -1)}</em>;
    return <span key={index}>{token}</span>;
  });
}

function AssistantMessage({ content }: { content: string }) {
  const sourceMatches = [...content.matchAll(/\[(meeting|event|policy|decision|minutes|meeting_transcript|meeting_ai_analysis):([^\]]+)\]/gi)];
  const clean = content
    .replace(/\[(meeting|event|policy|decision|minutes|meeting_transcript|meeting_ai_analysis):[^\]]+\]/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const lines = clean.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let bullets: { text: string; ordered: boolean }[] = [];

  const flushList = () => {
    if (!bullets.length) return;
    const ordered = bullets[0].ordered;
    const ListTag = ordered ? "ol" : "ul";
    blocks.push(
      <ListTag key={`list-${blocks.length}`} className={`${ordered ? "list-decimal" : "list-disc"} my-3 space-y-1.5 pl-5 text-slate-200`}>
        {bullets.map((item, index) => <li key={index} className="pl-1 leading-6">{inlineMarkdown(item.text)}</li>)}
      </ListTag>,
    );
    bullets = [];
  };

  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (!line) { flushList(); return; }
    if (/^[-*_]{3,}$/.test(line)) { flushList(); return; }

    const bullet = line.match(/^[-*•]\s+(.+)$/);
    const numbered = line.match(/^\d+[.)]\s+(.+)$/);
    if (bullet) { bullets.push({ text: bullet[1], ordered: false }); return; }
    if (numbered) { bullets.push({ text: numbered[1], ordered: true }); return; }

    flushList();
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      blocks.push(<h3 key={index} className="mt-4 mb-2 text-base font-semibold text-white first:mt-0">{inlineMarkdown(heading[1])}</h3>);
      return;
    }

    const label = line.match(/^\*\*(.+?)\*\*\s*:\s*(.*)$/);
    if (label) {
      blocks.push(<p key={index} className="my-2 leading-6"><strong className="font-semibold text-cyan-200">{label[1]}:</strong>{label[2] ? <> {inlineMarkdown(label[2])}</> : null}</p>);
      return;
    }

    blocks.push(<p key={index} className="my-2 leading-6 text-slate-200">{inlineMarkdown(line)}</p>);
  });
  flushList();

  return (
    <div className="text-[15px] leading-6">
      {blocks}
      {sourceMatches.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-700/70 pt-3">
          <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Sources</span>
          {Array.from(new Set(sourceMatches.map(match => match[1].toLowerCase()))).map(type => (
            <span key={type} className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/80 px-2.5 py-1 text-xs text-slate-300">
              <Check size={12} className="text-cyan-300" /> {type.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

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
    const message = text.trim(); if (!message || busy) return;
    setBusy(true); setError(""); setQuery(""); setMessages(prev => [...prev, { role: "user", content: message }]);
    try { const result = await api<any>("/api/assistant", { method: "POST", body: JSON.stringify({ message }) }); setMessages(prev => [...prev, { role: "assistant", content: result.answer ?? "I couldn't find a useful answer." }]); }
    catch (e) { setError(e instanceof Error ? e.message : "Assistant failed."); }
    finally { setBusy(false); }
  }

  async function prepareMeeting(message: string) {
    setBusy(true); setError("");
    try {
      const result = await api<any>("/api/assistant/meeting-action", { method: "POST", body: JSON.stringify({ action: "prepare", message }) });
      const hasNeeds = Boolean(result.needs?.length);
      if (hasNeeds) setError(`Meeting needs: ${result.needs.join(", ")}. Try mentioning a date/time and a participant department, role, or email.`);
      setDraft(result.draft ?? null); setParticipants(result.participants ?? []); setSelected([]);
      return !hasNeeds;
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
      <section className="card flex min-h-[560px] flex-col p-5">
        <div className="flex-1 space-y-4 overflow-auto pr-1">
          {!messages.length && <div className="py-16 text-center"><Sparkles className="mx-auto mb-4" size={34}/><h2 className="text-xl font-semibold">How can I help?</h2><p className="mx-auto mt-2 max-w-lg text-slate-400">Ask in normal language. You don't need exact commands or database terms.</p><div className="mt-6 flex flex-wrap justify-center gap-2">{suggestions.map(s => <button key={s} onClick={() => void ask(s)} className="btn btn-secondary text-sm">{s}</button>)}</div></div>}
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[88%] rounded-2xl px-4 py-3 shadow-sm ${m.role === "user" ? "bg-indigo-600 text-white" : "border border-slate-700/80 bg-slate-800/90 text-slate-100"}`}>
                <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide opacity-70">{m.role === "user" ? <><UserRound size={14}/> You</> : <><Bot size={14}/> Governance AI</>}</div>
                {m.role === "assistant" ? <AssistantMessage content={m.content}/> : <div className="whitespace-pre-wrap leading-6">{m.content}</div>}
              </div>
            </div>
          ))}
          {busy && <div className="flex items-center gap-2 text-sm text-slate-400"><Bot size={15}/> Assistant is thinking<span className="animate-pulse">...</span></div>}
        </div>
        {error && <p className="mb-3 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-300" role="alert">{error}</p>}
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
