"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

export default function DeclineMeetingPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reason.trim().length < 5 || saving) {
      setError("Please provide a clear reason of at least 5 characters.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/meetings/${params.id}/decline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to decline meeting.");
      setDone(true);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Unable to decline meeting.");
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <div className="rounded-2xl border border-emerald-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Meeting declined</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Your response has been sent.</h1>
          <p className="mt-3 text-slate-600">The organizer has received your reason by email.</p>
          <button type="button" className="btn btn-primary mt-6" onClick={() => router.push(`/meetings/${params.id}`)}>Back to meeting</button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-red-700">Decline meeting</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Why can&apos;t you attend?</h1>
        <p className="mt-3 text-slate-600">A reason is required and will be emailed directly to the meeting organizer.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Reason for declining
            <textarea
              className="textarea mt-2 min-h-36 w-full"
              value={reason}
              maxLength={1000}
              onChange={(event) => setReason(event.target.value)}
              placeholder="For example: I have an examination at the same time."
              required
            />
            <span className="mt-1 block text-xs text-slate-500">{reason.length}/1000</span>
          </label>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <div className="flex flex-wrap gap-3">
            <Link href={`/meetings/${params.id}`} className="btn btn-secondary">Cancel</Link>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? "Sending..." : "Decline & notify organizer"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
