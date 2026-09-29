"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });

    setLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setMessage("If an account exists for this email, a password reset link has been sent. Check your inbox and spam folder.");
  }

  return (
    <div className="mx-auto mt-20 max-w-md card p-8">
      <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-cyan-400">GovAI</p>
      <h1 className="mb-2 text-2xl font-bold">Forgot password?</h1>
      <p className="mb-6 text-slate-400">Enter your registered email and we&apos;ll send you a secure password reset link.</p>
      <form onSubmit={submit} className="space-y-4">
        <input className="input" type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <button className="btn btn-primary w-full" disabled={loading}>{loading ? "Sending..." : "Send reset link"}</button>
        {message && <p className="text-emerald-400">{message}</p>}
        {error && <p className="text-red-400">{error}</p>}
      </form>
      <Link href="/login" className="mt-5 inline-block text-sm text-cyan-400 hover:underline">← Back to login</Link>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return <Suspense fallback={<div className="mx-auto mt-20 max-w-md card p-8">Loading...</div>}><ForgotPasswordForm /></Suspense>;
}
