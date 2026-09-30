"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const REVIEWERS = ["Director", "Principal", "HOD", "Coordinator", "Super Admin", "Meeting Secretary"];
const STATUSES = ["Submitted", "Under Review", "Accepted", "Rejected", "Implemented"];

type Suggestion = { id:string; title:string; content:string; status:string; review_notes:string|null; created_at:string };

export default function SuggestionsPage() {
  const [role, setRole] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadForReviewer() {
    const res = await fetch("/api/suggestions", { cache: "no-store" });
    if (!res.ok) return;
    const json = await res.json();
    setItems(json.data ?? []);
  }

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: profile } = await supabase.from("users").select("role").eq("id", data.user.id).maybeSingle();
      const nextRole = profile?.role ?? "";
      setRole(nextRole);
      if (REVIEWERS.includes(nextRole)) loadForReviewer();
    });
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setMessage("");
    const res = await fetch("/api/suggestions", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ title, content }) });
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? "Unable to submit suggestion."); return; }
    setTitle(""); setContent(""); setMessage("Suggestion submitted successfully.");
    if (REVIEWERS.includes(role)) loadForReviewer();
  }

  async function review(id:string, status:string) {
    setError("");
    const res = await fetch(`/api/suggestions/${id}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ status }) });
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? "Unable to update suggestion."); return; }
    setItems(current => current.map(item => item.id === id ? json.data : item));
  }

  return <div className="mx-auto max-w-5xl space-y-6">
    <div><h1 className="text-3xl font-semibold">Suggestion Box</h1><p className="mt-2 text-slate-400">Share ideas that can improve institutional operations, academics, events or governance.</p></div>
    <section className="card space-y-4">
      <h2 className="text-lg font-semibold">Submit a suggestion</h2>
      <form onSubmit={submit} className="space-y-4">
        <input className="input" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Suggestion title" required />
        <textarea className="input min-h-36" value={content} onChange={e=>setContent(e.target.value)} placeholder="Describe the idea, problem and expected benefit..." required />
        <button className="btn btn-primary" type="submit">Submit suggestion</button>
      </form>
      {message && <p className="text-sm text-emerald-300">{message}</p>}
      {error && <p className="text-sm text-red-300" role="alert">{error}</p>}
    </section>

    {REVIEWERS.includes(role) && <section className="space-y-4">
      <div><h2 className="text-xl font-semibold">Review dashboard</h2><p className="text-sm text-slate-500">Only leadership roles can see and act on all submitted suggestions.</p></div>
      {items.length === 0 ? <div className="card text-slate-500">No suggestions yet.</div> : items.map(item => <article key={item.id} className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">{item.title}</h3><p className="mt-1 text-xs text-slate-500">{new Date(item.created_at).toLocaleString()}</p></div><span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">{item.status}</span></div>
        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-300">{item.content}</p>
        <div className="flex flex-wrap gap-2">{STATUSES.filter(status=>status!==item.status).map(status=><button key={status} className="btn btn-secondary text-xs" onClick={()=>review(item.id,status)}>{status}</button>)}</div>
      </article>)}
    </section>}
  </div>;
}
