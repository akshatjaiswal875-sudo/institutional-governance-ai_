"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SuggestionTagSelector } from "@/components/suggestion-tag-selector";

const REVIEWERS = ["Director", "Principal", "HOD", "Coordinator"];
const STATUSES = ["Submitted", "Under Review", "Accepted", "Rejected", "Implemented"];

type Tag = { id: string; type: "policy" | "event"; customId: string; title: string; archived?: boolean };
type Suggestion = {
  id: string;
  title: string;
  content: string;
  status: string;
  review_notes: string | null;
  created_at: string;
  policy_tags?: Tag[];
  event_tags?: Tag[];
};

export default function SuggestionsPage() {
  const [role, setRole] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function loadForReviewer() {
    const res = await fetch("/api/suggestions", { cache: "no-store" });
    if (!res.ok) return;
    const json = (await res.json()) as { data?: Suggestion[] };
    setItems(json.data ?? []);
  }

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: profile } = await supabase.from("users").select("role").eq("id", data.user.id).maybeSingle();
      const nextRole = profile?.role ?? "";
      setRole(nextRole);
      if (REVIEWERS.includes(nextRole)) await loadForReviewer();
    });
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content,
          taggedPolicyIds: tags.filter((tag) => tag.type === "policy").map((tag) => tag.id),
          taggedEventIds: tags.filter((tag) => tag.type === "event").map((tag) => tag.id),
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Unable to submit suggestion.");
        return;
      }
      setTitle("");
      setContent("");
      setTags([]);
      setMessage("Suggestion submitted successfully.");
      if (REVIEWERS.includes(role)) await loadForReviewer();
    } catch {
      setError("Unable to submit suggestion. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function review(id: string, status: string) {
    setError("");
    try {
      const res = await fetch(`/api/suggestions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = (await res.json()) as { data?: Suggestion; error?: string };
      if (!res.ok) {
        setError(json.error ?? "Unable to update suggestion.");
        return;
      }
      if (json.data) setItems((current) => current.map((item) => item.id === id ? json.data! : item));
    } catch {
      setError("Unable to update suggestion.");
    }
  }

  const tagList = (item: Suggestion) => [...(item.policy_tags ?? []), ...(item.event_tags ?? [])];

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Suggestion Box</h1>
        <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
          Share ideas that can improve institutional operations, academics, events or governance.
        </p>
      </header>

      <section className="card mt-7 w-full p-5 sm:p-6">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">Submit a suggestion</h2>
          <p className="text-sm leading-6 text-slate-600">Tell us what could make the institution work better.</p>
        </div>
        <form onSubmit={submit} className="mt-5 flex w-full flex-col gap-4">
          <div className="w-full">
            <label htmlFor="suggestion-title" className="mb-2 block text-sm font-medium">Suggestion title</label>
            <input id="suggestion-title" className="input w-full" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Suggestion title" required />
          </div>
          <div className="w-full">
            <label htmlFor="suggestion-content" className="mb-2 block text-sm font-medium">Your idea</label>
            <textarea id="suggestion-content" className="input min-h-40 w-full resize-y" value={content} onChange={(e) => setContent(e.target.value)} placeholder="Describe the idea, problem and expected benefit..." required />
          </div>
          <SuggestionTagSelector value={tags} onChange={setTags} />
          <div className="flex justify-start pt-1">
            <button className="btn btn-primary min-w-40 disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit suggestion"}
            </button>
          </div>
        </form>
        {message && <p className="mt-4 text-sm text-emerald-700" role="status">{message}</p>}
        {error && <p className="mt-4 text-sm text-red-700" role="alert">{error}</p>}
      </section>

      {REVIEWERS.includes(role) && (
        <section className="mt-8 w-full">
          <header className="mb-4 space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight">Review dashboard</h2>
            <p className="text-sm leading-6 text-slate-600">Only leadership roles can see and act on all submitted suggestions.</p>
          </header>
          {items.length === 0 ? (
            <div className="card w-full px-5 py-4 text-sm text-slate-600">No suggestions yet.</div>
          ) : (
            <div className="w-full space-y-4">
              {items.map((item) => (
                <article key={item.id} className="card w-full space-y-4 p-5 sm:p-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="break-words text-lg font-semibold">{item.title}</h3>
                      <p className="mt-1 text-xs text-slate-500">{new Date(item.created_at).toLocaleString()}</p>
                    </div>
                    <span className="w-fit shrink-0 rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700">{item.status}</span>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{item.content}</p>
                  {tagList(item).length > 0 && (
                    <div className="flex flex-wrap gap-2" aria-label="Linked policies and events">
                      {tagList(item).map((tag) => (
                        <a
                          key={`${tag.type}:${tag.id}`}
                          href={`/${tag.type === "policy" ? "policies" : "events"}/${tag.id}`}
                          className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-800 hover:bg-indigo-100"
                          title={tag.title}
                        >
                          {tag.customId}
                        </a>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {STATUSES.filter((status) => status !== item.status).map((status) => (
                      <button key={status} className="btn btn-secondary text-xs" onClick={() => void review(item.id, status)}>{status}</button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
