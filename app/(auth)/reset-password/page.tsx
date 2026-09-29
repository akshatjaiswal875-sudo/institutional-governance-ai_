"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const check = async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      if (!data.user) setError("This password reset link is invalid or has expired. Please request a new link.");
      setLoading(false);
    };
    void check();
    return () => { active = false; };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setSaving(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) return setError(updateError.message);
    router.replace("/dashboard");
    router.refresh();
  }

  if (loading) return <div className="mx-auto mt-20 max-w-md card p-8">Checking reset link...</div>;

  return (
    <div className="mx-auto mt-20 max-w-md card p-8">
      <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-cyan-400">GovAI</p>
      <h1 className="text-2xl font-bold">Create a new password</h1>
      <p className="mt-2 mb-6 text-slate-400">Choose a new password for your account.</p>
      <form onSubmit={submit} className="space-y-4">
        <input className="input" type="password" minLength={8} placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <input className="input" type="password" minLength={8} placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        <button className="btn btn-primary w-full" disabled={saving}>{saving ? "Updating password..." : "Update password"}</button>
        {error && <p className="text-red-400">{error}</p>}
      </form>
      {!loading && error && <Link href="/forgot-password" className="mt-5 inline-block text-sm text-cyan-400 hover:underline">Request a new reset link</Link>}
    </div>
  );
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<div className="mx-auto mt-20 max-w-md card p-8">Loading...</div>}><ResetPasswordForm /></Suspense>;
}
