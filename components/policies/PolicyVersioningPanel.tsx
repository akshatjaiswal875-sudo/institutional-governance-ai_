"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronDown, GitCompareArrows, History, RotateCcw, Save } from "lucide-react";

type Version = { id: string; versionNumber: number; title: string; content: string; changeSummary: string | null; createdAt: string; createdBy: { name: string | null; email: string; role: string } };

type Props = { policyId: string };

function splitWords(text: string) { return text.split(/(\s+)/); }
function diffWords(a: string, b: string) {
  const left = splitWords(a); const right = splitWords(b); const out: React.ReactNode[] = [];
  const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i++) {
    if (left[i] === right[i]) out.push(<span key={`same-${i}`}>{left[i] ?? ""}</span>);
    else {
      if (left[i]) out.push(<span key={`old-${i}`} className="rounded bg-red-500/15 text-red-300 line-through">{left[i]}</span>);
      if (right[i]) out.push(<span key={`new-${i}`} className="rounded bg-emerald-500/15 text-emerald-300">{right[i]}</span>);
    }
  }
  return out;
}

export function PolicyVersioningPanel({ policyId }: Props) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [compareA, setCompareA] = useState(0);
  const [compareB, setCompareB] = useState(0);
  const [mode, setMode] = useState<"side" | "diff">("side");
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    try { const r = await fetch(`/api/policies/${policyId}/versions`, { cache: "no-store" }); const body = await r.json(); if (!r.ok) throw new Error(body.error); setVersions(body.data ?? []); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to load version history."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [policyId]);

  const current = versions[0];
  const viewed = selected ? versions.find(v => v.versionNumber === selected) : current;
  const a = versions.find(v => v.versionNumber === compareA);
  const b = versions.find(v => v.versionNumber === compareB);

  function beginEdit() { if (!current) return; setTitle(current.title); setContent(current.content); setSummary(""); setEditing(true); setMessage(""); }
  async function save() {
    if (!current || saving) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const r = await fetch(`/api/policies/${policyId}/versions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, content, changeSummary: summary, baseVersionNumber: current.versionNumber }) });
      const body = await r.json(); if (!r.ok) throw new Error(body.error); setEditing(false); setMessage(`Saved as v${body.data.versionNumber}.`); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save policy."); }
    finally { setSaving(false); }
  }
  async function restore(version: Version) {
    if (!window.confirm(`Restore v${version.versionNumber}? This creates a new version and never deletes history.`)) return;
    setError("");
    try { const r = await fetch(`/api/policies/${policyId}/versions/${version.versionNumber}/restore`, { method: "POST" }); const body = await r.json(); if (!r.ok) throw new Error(body.error); setMessage(`Restored as v${body.data.versionNumber}.`); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to restore version."); }
  }

  return <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5" aria-label="Policy version history">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><History size={18} className="text-violet-300"/><h2 className="text-lg font-semibold text-white">Version History</h2>{current && <span className="rounded-full bg-violet-400/10 px-2 py-1 text-xs font-semibold text-violet-300">Current v{current.versionNumber}</span>}</div><p className="mt-1 text-sm text-slate-500">Every edit creates an immutable version. Older versions remain read-only.</p></div><button className="btn btn-primary" onClick={beginEdit} disabled={!current}><Save size={15}/> Edit as new version</button></div>
    {message && <p className="mt-4 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-300" role="status">{message}</p>}
    {error && <p className="mt-4 flex gap-2 rounded-lg bg-red-500/10 p-3 text-sm text-red-300" role="alert"><AlertTriangle size={16}/>{error}</p>}
    {editing && current && <div className="mt-5 grid gap-4 rounded-xl border border-slate-700 bg-slate-950/60 p-4"><label className="text-sm text-slate-300">Title<input className="input mt-1" value={title} onChange={e=>setTitle(e.target.value)}/></label><label className="text-sm text-slate-300">Content<textarea className="textarea mt-1 min-h-48" value={content} onChange={e=>setContent(e.target.value)}/></label><label className="text-sm text-slate-300">Change summary <span className="text-slate-600">({summary.length}/280)</span><input className="input mt-1" maxLength={280} value={summary} onChange={e=>setSummary(e.target.value)} placeholder="Explain what changed"/></label><div className="flex gap-2"><button className="btn btn-primary" onClick={()=>void save()} disabled={saving || !summary.trim()}>{saving ? "Saving..." : "Create version"}</button><button className="btn btn-secondary" onClick={()=>setEditing(false)}>Cancel</button></div></div>}
    {loading ? <div className="mt-5 h-32 animate-pulse rounded-xl bg-slate-800/60"/> : versions.length === 0 ? <p className="mt-5 rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">No versions found for this policy.</p> : <>
      {viewed && selected && selected !== current?.versionNumber && <div className="mt-5 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-amber-300">You are viewing an older version (v{selected}). It is read-only.</div>}
      <div className="mt-5 grid gap-5 lg:grid-cols-[280px_1fr]"><div className="space-y-2">{versions.map(v=><button key={v.id} onClick={()=>setSelected(v.versionNumber)} className={`w-full rounded-xl border p-3 text-left transition ${v.versionNumber === (selected ?? current?.versionNumber) ? "border-violet-400/40 bg-violet-400/10" : "border-slate-800 bg-slate-950/40 hover:border-slate-700"}`}><div className="flex items-center justify-between"><span className="font-semibold text-white">v{v.versionNumber}</span><span className="text-xs text-slate-500">{new Date(v.createdAt).toLocaleDateString("en-IN")}</span></div><p className="mt-1 truncate text-sm text-slate-300">{v.title}</p><p className="mt-1 line-clamp-2 text-xs text-slate-500">{v.changeSummary || "Initial version"}</p></button>)}</div>
      {viewed && <article className="rounded-xl border border-slate-800 bg-slate-950/50 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-xl font-semibold text-white">{viewed.title}</h3><p className="mt-1 text-xs text-slate-500">Version {viewed.versionNumber} · {viewed.createdBy.name || viewed.createdBy.email} · {new Date(viewed.createdAt).toLocaleString("en-IN")}</p></div>{viewed.versionNumber !== current?.versionNumber && <button className="btn btn-secondary" onClick={()=>void restore(viewed)}><RotateCcw size={15}/> Restore as new version</button>}</div><div className="mt-5 whitespace-pre-wrap rounded-lg bg-slate-900 p-4 text-sm leading-7 text-slate-300">{viewed.content}</div></article>}</div>
      <div className="mt-6 border-t border-slate-800 pt-5"><div className="flex flex-wrap items-center gap-2"><GitCompareArrows size={17} className="text-cyan-300"/><h3 className="font-semibold text-white">Compare versions</h3><select className="select w-auto" value={compareA} onChange={e=>setCompareA(Number(e.target.value))}><option value={0}>Select A</option>{versions.map(v=><option key={v.id} value={v.versionNumber}>v{v.versionNumber}</option>)}</select><span className="text-slate-600">vs</span><select className="select w-auto" value={compareB} onChange={e=>setCompareB(Number(e.target.value))}><option value={0}>Select B</option>{versions.map(v=><option key={v.id} value={v.versionNumber}>v{v.versionNumber}</option>)}</select><button className="btn btn-secondary" disabled={!a || !b} onClick={()=>setMode(mode === "side" ? "diff" : "side")}>{mode === "side" ? "Unified diff" : "Side by side"}</button></div>{a && b && <div className="mt-4 grid gap-3 md:grid-cols-2">{mode === "side" ? <><div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4"><p className="mb-2 text-xs font-semibold text-red-300">v{a.versionNumber}</p><p className="whitespace-pre-wrap text-sm text-slate-300">{a.content}</p></div><div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4"><p className="mb-2 text-xs font-semibold text-emerald-300">v{b.versionNumber}</p><p className="whitespace-pre-wrap text-sm text-slate-300">{b.content}</p></div></> : <div className="md:col-span-2 rounded-lg border border-slate-800 bg-slate-950 p-4 text-sm leading-7">{diffWords(a.content,b.content)}</div>}</div>}</div>
    </>}
  </section>;
}
