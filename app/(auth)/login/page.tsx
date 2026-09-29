"use client";
import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const searchParams = useSearchParams();
  const [error, setError] = useState(searchParams.get("error") ?? "");
  const [message, setMessage] = useState(searchParams.get("password_created") === "1" ? "Password created successfully. Sign in with your new password." : "");
  const router = useRouter();

  useEffect(() => {
    const value = searchParams.get("error");
    if (value) setError(value);
    if (searchParams.get("password_created") === "1") setMessage("Password created successfully. Sign in with your new password.");
  }, [searchParams]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");

    try {
      const s = createClient();
      const { data, error } = await s.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
        return;
      }

      if (data.user?.app_metadata?.must_change_password === true) {
        router.replace("/set-password?first_login=1");
        router.refresh();
        return;
      }

      const requestedPath = searchParams.get("next");
      const destination = requestedPath?.startsWith("/") && !requestedPath.startsWith("//")
        ? requestedPath
        : "/dashboard";
      router.replace(destination);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error && err.message.includes("fetch")
        ? "Unable to reach the Supabase authentication service. Check your Supabase URL and network connectivity."
        : err instanceof Error ? err.message : "Authentication failed.";
      setError(message);
    }
  }

  return (
    <div className="mx-auto mt-20 max-w-md card p-8">
      <h1 className="mb-2 text-2xl font-bold">Institutional Governance AI</h1>
      <p className="mb-6 text-slate-400">Sign in with your Supabase Auth account.</p>
      <form onSubmit={submit} className="space-y-4">
        <input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <div className="-mt-2 flex justify-end">
          <Link href="/forgot-password" className="text-sm text-cyan-400 hover:underline">Forgot password?</Link>
        </div>
        <button className="btn btn-primary w-full">Sign in</button>
        {message && <p className="text-emerald-400" role="status">{message}</p>}
        {error && <p className="text-red-400" role="alert">{error}</p>}
      </form>
    </div>
  );
}

export default function Login() {
  return <Suspense fallback={<div className="mx-auto mt-20 max-w-md card p-8">Loading...</div>}><LoginForm /></Suspense>;
}
