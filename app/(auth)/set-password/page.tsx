"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";

function SetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const check = async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      if (!data.user) {
        setError("This invitation link is invalid or has expired. Please request a new invitation.");
      } else {
        setEmail(data.user.email ?? "");
      }
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

  if (loading) return <div className="mx-auto mt-20 max-w-md card p-8">Checking invitation...</div>;

  return (
    <div className="mx-auto mt-20 max-w-md card p-8">
      <div className="mb-6">
        <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-cyan-400">GovAI</p>
        <h1 className="text-2xl font-bold">Complete your account</h1>
        <p className="mt-2 text-slate-400">Set a password to finish accepting your invitation.</p>
        {email && <p className="mt-3 text-sm text-slate-300">Invited email: {email}</p>}
      </div>
      <form onSubmit={submit} className="space-y-4">
        <input className="input" type="password" minLength={8} placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <input className="input" type="password" minLength={8} placeholder="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        <button className="btn btn-primary w-full" disabled={saving}>{saving ? "Creating account..." : "Create account"}</button>
        {error && <p className="text-red-400">{error}</p>}
      </form>
    </div>
  );
}

export default function SetPasswordPage() {
  return <Suspense fallback={<div className="mx-auto mt-20 max-w-md card p-8">Loading...</div>}><SetPasswordForm /></Suspense>;
}
