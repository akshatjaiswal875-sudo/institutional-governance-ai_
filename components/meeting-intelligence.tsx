"use client";

import { useEffect, useState } from "react";
import { Badge, Card } from "@/components/ui";

type Intelligence = { recordings: any[]; transcripts: any[]; analyses: any[] };

async function readJson(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) throw new Error(`Request failed (${response.status}).`);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
  return result;
}

export function MeetingIntelligence({ meetingId }: { meetingId: string }) {
  const [data, setData] = useState<Intelligence>({ recordings: [], transcripts: [], analyses: [] });
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState("");
  const [minutes, setMinutes] = useState("");
  const [decisions, setDecisions] = useState<any[]>([]);
  const [actions, setActions] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const result = await readJson(await fetch(`/api/meetings/${meetingId}/intelligence`, { cache: "no-store" }));
    setData(result.data);
    const analysis = result.data.analyses?.[0];
    setSummary(analysis?.summary || "");
    setMinutes(analysis?.suggested_minutes || "");
    setDecisions(Array.isArray(analysis?.extracted_decisions) ? analysis.extracted_decisions : []);
    setActions(Array.isArray(analysis?.extracted_action_items) ? analysis.extracted_action_items : []);
  }

  useEffect(() => { load().catch((e) => setError(e instanceof Error ? e.message : "Unable to load intelligence.")); }, [meetingId]);

  async function upload(event: React.FormEvent) {
    event.preventDefault(); if (!file || busy) return;
    setBusy(true); setError(""); setMessage("");
    try { const form = new FormData(); form.append("file", file); await readJson(await fetch(`/api/meetings/${meetingId}/recordings`, { method: "POST", body: form })); setFile(null); setMessage("Recording uploaded."); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Upload failed."); } finally { setBusy(false); }
  }

  async function processRecording(recordingId: string) {
    if (processingId) return;
    setProcessingId(recordingId); setError(""); setMessage("Processing with Local Whisper and Hugging Face…");
    try { await readJson(await fetch(`/api/meetings/${meetingId}/intelligence/process`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recordingId }) })); setMessage("Processing completed. Review the results below."); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Processing failed."); await load().catch((): void => undefined); } finally { setProcessingId(null); }
  }

  async function deleteRecording(id: string) {
    if (!window.confirm("Delete this recording and its transcript, AI analysis and embeddings?")) return;
    setBusy(true); setError("");
    try { await readJson(await fetch(`/api/meetings/${meetingId}/recordings?recordingId=${encodeURIComponent(id)}`, { method: "DELETE" })); setMessage("Recording deleted."); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Delete failed."); } finally { setBusy(false); }
  }

  async function replaceRecording(id: string, replacement: File | undefined) {
    if (!replacement || busy) return;
    setBusy(true); setError("");
    try { const form = new FormData(); form.append("file", replacement); form.append("recordingId", id); const result = await readJson(await fetch(`/api/meetings/${meetingId}/recordings`, { method: "PUT", body: form })); setMessage("Recording replaced. Processing the new recording…"); await load(); await processRecording(result.data.id); }
    catch (e) { setError(e instanceof Error ? e.message : "Replacement failed."); } finally { setBusy(false); }
  }

  async function play(id: string) {
    try { const result = await readJson(await fetch(`/api/meetings/${meetingId}/recordings?recordingId=${encodeURIComponent(id)}`)); window.open(result.data.url, "_blank", "noopener,noreferrer"); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to open recording."); }
  }

  async function approve() {
    const analysis = data.analyses?.[0]; if (!analysis || busy) return;
    setBusy(true); setError("");
    try { await readJson(await fetch(`/api/meetings/${meetingId}/intelligence/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ analysisId: analysis.id, summary, suggestedMinutes: minutes, decisions, actionItems: actions }) })); setMessage("AI results approved and saved."); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Approval failed."); } finally { setBusy(false); }
  }

  const transcript = data.transcripts?.[0]?.transcript;
  const analysis = data.analyses?.[0];

  return <Card title="Meeting Intelligence"><div className="space-y-6">
    <section className="rounded-xl border border-slate-800 p-4"><div className="mb-3 flex items-center justify-between"><div><h3 className="font-semibold">Recording</h3><p className="text-sm text-slate-400">Source audio/video and processing controls.</p></div><Badge>{data.recordings.length} file{data.recordings.length === 1 ? "" : "s"}</Badge></div>
      <form onSubmit={upload} className="mb-4 flex flex-wrap gap-3"><input type="file" accept="audio/*,video/*" onChange={(e) => setFile(e.target.files?.[0] || null)} /><button className="btn btn-primary" disabled={!file || busy}>{busy ? "Working…" : "Upload"}</button></form>
      <div className="space-y-3">{data.recordings.map((r) => <div key={r.id} className="rounded-lg border border-slate-800 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium">{r.original_filename}</p><p className="text-xs text-slate-400">{(r.file_size / 1024 / 1024).toFixed(2)} MB</p></div><Badge>{r.status}</Badge></div>{r.error_message && <p className="mt-2 text-sm text-red-400">{r.error_message}</p>}<div className="mt-3 flex flex-wrap gap-2"><button className="btn btn-secondary" onClick={() => play(r.id)}>Play</button>{["uploaded", "failed"].includes(r.status) && <button className="btn btn-secondary" disabled={!!processingId} onClick={() => processRecording(r.id)}>{processingId === r.id ? "Processing…" : r.status === "failed" ? "Retry" : "Process"}</button>}<label className="btn btn-secondary cursor-pointer">Replace<input className="hidden" type="file" accept="audio/*,video/*" onChange={(e) => replaceRecording(r.id, e.target.files?.[0])} /></label><button className="btn btn-secondary" disabled={busy} onClick={() => deleteRecording(r.id)}>Delete</button></div></div>)}</div>
      {data.recordings.length === 0 && <p className="rounded-lg border border-dashed border-slate-700 p-4 text-sm text-slate-400">No recording uploaded.</p>}
    </section>

    <section className="rounded-xl border border-slate-800 p-4"><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">Transcript</h3>{data.transcripts?.[0] && <Badge>{data.transcripts[0].status}</Badge>}</div>{transcript ? <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-4 text-sm leading-6">{transcript}</pre> : <p className="text-sm text-slate-400">Transcript appears here after Local Whisper processing.</p>}</section>

    <section className="rounded-xl border border-slate-800 p-4"><div className="mb-4 flex items-center justify-between"><div><h3 className="font-semibold">AI Analysis</h3><p className="text-sm text-slate-400">Hugging Face output for human review.</p></div>{analysis && <Badge>{analysis.status === "approved" ? "Approved" : "Requires Review"}</Badge>}</div>{!analysis ? <p className="text-sm text-slate-400">No AI analysis yet.</p> : <div className="space-y-4"><label className="block text-sm">Summary<textarea className="textarea mt-1" value={summary} onChange={(e) => setSummary(e.target.value)} /></label><label className="block text-sm">Suggested Minutes<textarea className="textarea mt-1 min-h-32" value={minutes} onChange={(e) => setMinutes(e.target.value)} /></label><div><h4 className="mb-2 font-medium">Decisions</h4>{decisions.map((d, i) => <div className="mb-2 rounded-lg border border-slate-800 p-3" key={i}><textarea className="textarea" value={d.decision_text || ""} onChange={(e) => setDecisions((x) => x.map((v, n) => n === i ? { ...v, decision_text: e.target.value } : v))} /><input className="input mt-2" value={d.action_item || ""} placeholder="Action item" onChange={(e) => setDecisions((x) => x.map((v, n) => n === i ? { ...v, action_item: e.target.value } : v))} /></div>)}{!decisions.length && <p className="text-sm text-slate-400">No decisions extracted.</p>}</div><div><h4 className="mb-2 font-medium">Action Items</h4>{actions.map((a, i) => <div className="mb-2 grid gap-2 rounded-lg border border-slate-800 p-3 sm:grid-cols-3" key={i}><input className="input sm:col-span-2" value={a.task || ""} placeholder="Task" onChange={(e) => setActions((x) => x.map((v, n) => n === i ? { ...v, task: e.target.value } : v))} /><input className="input" value={a.assignee_email || ""} placeholder="Assignee" onChange={(e) => setActions((x) => x.map((v, n) => n === i ? { ...v, assignee_email: e.target.value } : v))} /><input className="input" type="date" value={a.deadline || ""} onChange={(e) => setActions((x) => x.map((v, n) => n === i ? { ...v, deadline: e.target.value } : v))} /><select className="select" value={a.priority || "Medium"} onChange={(e) => setActions((x) => x.map((v, n) => n === i ? { ...v, priority: e.target.value } : v))}><option>Low</option><option>Medium</option><option>High</option><option>Critical</option></select></div>)}{!actions.length && <p className="text-sm text-slate-400">No action items extracted.</p>}</div>{analysis.status !== "approved" && <button className="btn btn-primary" disabled={busy} onClick={approve}>{busy ? "Saving…" : "Approve reviewed results"}</button>}</div>}</section>
    {message && <p className="text-emerald-300" role="status">{message}</p>}{error && <p className="text-red-400" role="alert">{error}</p>}
  </div></Card>;
}
