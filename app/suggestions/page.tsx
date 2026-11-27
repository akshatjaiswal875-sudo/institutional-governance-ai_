"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SuggestionTagSelector } from "@/components/suggestion-tag-selector";

const VIEW_ONLY_ROLES = ["Super Admin", "Director", "Principal", "HOD"];
const REVIEWERS = [...VIEW_ONLY_ROLES, "Coordinator", "Coordinators", "Meeting Secretary"];
const CAN_UPDATE_STATUS = ["Coordinator", "Coordinators", "Meeting Secretary"];
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
  submitter?: { id: string; email: string; role: string; department: string | null } | null;
};

export default function SuggestionsPage() {
  const [role, setRole] = useState("");
  const [department, setDepartment] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const isViewOnly = VIEW_ONLY_ROLES.includes(role);
  const canReview = CAN_UPDATE_STATUS.includes(role);
  const isReviewer = REVIEWERS.includes(role);

  async function loadForReviewer() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/suggestions", { cache: "no-store" });
      const json = (await res.json()) as { data?: Suggestion[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Unable to load suggestions.");
      setItems(json.data ?? []);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Unable to load suggestions.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        if (active) {
          setError("Please sign in to view suggestions.");
          setReady(true);
        }
        return;
      }
      const { data: profile, error: profileError } = await supabase
        .from("users")
        .select("role, department")
        .eq("id", data.user.id)
        .maybeSingle();
      if (!active) return;
      if (profileError || !profile) {
        setError("Unable to load your institutional profile.");
        setReady(true);
        return;
      }
      setRole(profile.role ?? "");
      setDepartment(profile.department ?? null);
      setReady(true);
      if (REVIEWERS.includes(profile.role ?? "")) await loadForReviewer();
    });
    return () => { active = false; };
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
      if (isReviewer) await loadForReviewer();
    } catch {
      setError("Unable to submit suggestion. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function review(id: string, status: string) {
    if (!canReview) return;
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
      if (json.data) setItems((current) => current.map((item) => item.id === id ? { ...item, ...json.data } : item));
    } catch {
      setError("Unable to update suggestion.");
    }
  }

  const visibleItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return items;
    return items.filter((item) =>
      [item.title, item.content, item.submitter?.email, item.submitter?.role, item.submitter?.department]
        .some((value) => value?.toLocaleLowerCase().includes(query)),
    );
  }, [items, search]);

  const tagList = (item: Suggestion) => [...(item.policy_tags ?? []), ...(item.event_tags ?? [])];

  if (!ready) {
    return <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8"><div className="card p-6 text-sm text-slate-600">Loading suggestion access…</div></main>;
  }

  if (isViewOnly) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Suggestion Box</h1>
          <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
            View suggestions submitted by faculty, HODs and coordinators. This leadership view is read-only.
          </p>
        </header>
        <section className="mt-7 grid gap-3 sm:grid-cols-2">
          <div className="card p-5"><p className="text-sm text-slate-500">Suggestions visible</p><p className="mt-1 text-3xl font-semibold">{items.length}</p></div>
          <div className="card p-5"><p className="text-sm text-slate-500">Access scope</p><p className="mt-1 text-lg font-semibold">{role === "HOD" ? (department || "Department not assigned") : "Institution-wide"}</p></div>
        </section>
        <section className="mt-7">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="text-2xl font-semibold tracking-tight">Suggestions received</h2><p className="mt-1 text-sm text-slate-600">You can read suggestions and their linked policies/events, but cannot submit or change their status.</p></div>
            <button type="button" onClick={() => void loadForReviewer()} className="btn btn-secondary" disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
          </div>
          <input aria-label="Search suggestions" className="input mb-4 w-full" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by title, idea, submitter or department…" />
          {error && <p className="mb-4 text-sm text-red-700" role="alert">{error}</p>}
          {loading && items.length === 0 ? <div className="card p-5 text-sm text-slate-600">Loading suggestions…</div>
            : visibleItems.length === 0 ? <div className="card p-5 text-sm text-slate-600">{items.length === 0 ? "No suggestions have been submitted yet." : "No suggestions match your search."}</div>
            : <div className="space-y-4">
              {visibleItems.map((item) => (
                <article key={item.id} className="card space-y-4 p-5 sm:p-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="break-words text-lg font-semibold">{item.title}</h3>
                      <p className="mt-1 text-xs text-slate-500">{new Date(item.created_at).toLocaleString()}</p>
                    </div>
                    <span className="w-fit shrink-0 rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700">{item.status}</span>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 text-sm">
                    <p><span className="font-semibold">Submitted by:</span> {item.submitter?.email ?? "Account details unavailable"}</p>
                    <p className="mt-1"><span className="font-semibold">Role:</span> {item.submitter?.role ?? "Unknown"} <span className="mx-1">·</span> <span className="font-semibold">Department:</span> {item.submitter?.department ?? "Not assigned"}</p>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{item.content}</p>
                  {tagList(item).length > 0 && <div className="flex flex-wrap gap-2" aria-label="Linked policies and events">
                    {tagList(item).map((tag) => <a key={`${tag.type}:${tag.id}`} href={`/${tag.type === "policy" ? "policies" : "events"}/${tag.id}`} className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-800 hover:bg-indigo-100" title={tag.title}>{tag.customId}</a>)}
                  </div>}
                  {item.review_notes && <p className="text-sm text-slate-600"><span className="font-semibold">Review note:</span> {item.review_notes}</p>}
                </article>
              ))}
            </div>}
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Suggestion Box</h1>
        <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">Share ideas that can improve institutional operations, academics, events or governance.</p>
      </header>
      <section className="card mt-7 w-full p-5 sm:p-6">
        <div className="space-y-1"><h2 className="text-xl font-semibold tracking-tight">Submit a suggestion</h2><p className="text-sm leading-6 text-slate-600">Tell us what could make the institution work better.</p></div>
        <form onSubmit={submit} className="mt-5 flex w-full flex-col gap-4">
          <div className="w-full"><label htmlFor="suggestion-title" className="mb-2 block text-sm font-medium">Suggestion title</label><input id="suggestion-title" className="input w-full" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Suggestion title" required maxLength={200} /></div>
          <div className="w-full"><label htmlFor="suggestion-content" className="mb-2 block text-sm font-medium">Your idea</label><textarea id="suggestion-content" className="input min-h-40 w-full resize-y" value={content} onChange={(e) => setContent(e.target.value)} placeholder="Describe the idea, problem and expected benefit…" required maxLength={5000} /></div>
          <SuggestionTagSelector value={tags} onChange={setTags} />
          <div className="flex justify-start pt-1"><button className="btn btn-primary min-w-40 disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={submitting}>{submitting ? "Submitting…" : "Submit suggestion"}</button></div>
        </form>
        {message && <p className="mt-4 text-sm text-emerald-700" role="status">{message}</p>}
        {error && <p className="mt-4 text-sm text-red-700" role="alert">{error}</p>}
      </section>
      {canReview && <section className="mt-8 w-full">
        <header className="mb-4 space-y-1"><h2 className="text-2xl font-semibold tracking-tight">Review dashboard</h2><p className="text-sm leading-6 text-slate-600">Review and update submitted suggestions.</p></header>
        {items.length === 0 ? <div className="card w-full px-5 py-4 text-sm text-slate-600">No suggestions yet.</div> : <div className="w-full space-y-4">
          {items.map((item) => <article key={item.id} className="card w-full space-y-4 p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><h3 className="break-words text-lg font-semibold">{item.title}</h3><p className="mt-1 text-xs text-slate-500">{new Date(item.created_at).toLocaleString()}</p></div><span className="w-fit shrink-0 rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700">{item.status}</span></div>
            <p className="text-xs text-slate-500">From: {item.submitter?.email ?? "Unknown"} · {item.submitter?.department ?? "No department"}</p>
            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{item.content}</p>
            {STATUSES.filter((status) => status !== item.status).map((status) => <button key={status} className="btn btn-secondary mr-2 text-xs" onClick={() => void review(item.id, status)}>{status}</button>)}
          </article>)}
        </div>}
      </section>}
    </main>
  );
}
