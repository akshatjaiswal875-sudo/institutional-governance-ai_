"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const roles = ["Super Admin", "Meeting Secretary", "Faculty / Officer", "Member", "Auditor"] as const;

export default function InviteUserPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Member");
  const [department, setDepartment] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError("");
    setMessage("");
    setSaving(true);
    try {
      const response = await fetch("/api/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role, department }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to create user.");
      setMessage(`Invitation sent to ${email}. The user can create their password from the invitation link.`);
      setEmail("");
      setDepartment("");
      setTimeout(() => router.push("/admin/users"), 1200);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Unable to create user.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-cyan-400">User management</p>
          <h1 className="mt-1 text-3xl font-semibold">Create new user</h1>
          <p className="mt-2 text-slate-400">Invite a user securely. They will create their own password after opening the invitation.</p>
        </div>
        <Link href="/admin/users" className="btn btn-secondary">Back</Link>
      </div>

      <div className="card p-6">
        <form onSubmit={submit} className="space-y-5">
          <label className="block text-sm text-slate-300">
            <span className="mb-1 block">Email address</span>
            <input className="input" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="user@institution.edu" required autoComplete="email" />
          </label>

          <label className="block text-sm text-slate-300">
            <span className="mb-1 block">Role</span>
            <select className="select" value={role} onChange={event => setRole(event.target.value)}>
              {roles.map(item => <option key={item}>{item}</option>)}
            </select>
          </label>

          <label className="block text-sm text-slate-300">
            <span className="mb-1 block">Department</span>
            <input className="input" value={department} onChange={event => setDepartment(event.target.value)} placeholder="Administration / CSE / Faculty" />
          </label>

          <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-4 text-sm text-slate-300">
            <strong className="text-cyan-300">How it works:</strong> no password is entered or stored by the administrator. Supabase sends a secure invitation link, and the new user creates their password on the <code>/set-password</code> page.
          </div>

          <button className="btn btn-primary w-full" disabled={saving}>{saving ? "Sending invitation..." : "Create user & send invitation"}</button>
          {message && <p className="text-emerald-300" role="status">{message}</p>}
          {error && <p className="text-red-400" role="alert">{error}</p>}
        </form>
      </div>
    </div>
  );
}
