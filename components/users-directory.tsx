"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Card } from "@/components/ui";

const allowedRoles = ["Director", "Principal", "HOD", "Coordinator", "Faculty"] as const;

type UserRow = {
  id?: string;
  email?: string | null;
  role?: string | null;
  department?: string | null;
  name?: string | null;
  full_name?: string | null;
};

function getDisplayName(user: UserRow) {
  const explicitName = user.name?.trim() || user.full_name?.trim();
  if (explicitName) return explicitName;

  const localPart = user.email?.split("@")[0]?.replace(/[._-]+/g, " ").trim();
  if (!localPart) return "Unnamed user";

  return localPart.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function UsersDirectory() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    fetch("/api/users", { headers: { "Content-Type": "application/json" } })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Unable to load users.");
        return result.data ?? [];
      })
      .then((data) => {
        if (active) setUsers(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Unable to load users.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return users;

    return users.filter((user) => {
      const displayName = getDisplayName(user);
      return [displayName, user.name, user.full_name, user.email, user.role, user.department]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized));
    });
  }, [query, users]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Users</h1>
        <p className="mt-2 text-slate-500">Search and manage institutional users.</p>
      </div>

      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              size={18}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              className="input w-full pl-10 pr-10"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, email, role, or department"
              aria-label="Search users by name, email, role, or department"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear user search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700"
              >
                <X size={17} />
              </button>
            )}
          </div>
          <span className="text-sm text-slate-500" aria-live="polite">
            {filteredUsers.length} of {users.length} users
          </span>
        </div>
      </Card>

      <Card>
        {loading && <p className="text-slate-500">Loading users...</p>}
        {!loading && error && <p className="text-red-500" role="alert">{error}</p>}
        {!loading && !error && filteredUsers.length === 0 && (
          <div className="py-10 text-center">
            <p className="font-medium text-slate-700">No users found</p>
            <p className="mt-1 text-sm text-slate-500">
              Try a different name, email, role, or department.
            </p>
          </div>
        )}
        {!loading && !error && filteredUsers.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Name / Email</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Department</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user, index) => {
                  const role = user.role ?? "—";
                  const isAllowedRole = allowedRoles.includes(role as (typeof allowedRoles)[number]);
                  const displayName = getDisplayName(user);

                  return (
                    <tr key={user.id ?? user.email ?? index} className="border-t border-slate-200">
                      <td className="px-4 py-4">
                        <p className="font-medium text-slate-800">{displayName}</p>
                        <p className="break-all text-slate-600">{user.email ?? "Email unavailable"}</p>
                      </td>
                      <td className="px-4 py-4">
                        <span className={isAllowedRole ? "font-medium text-slate-700" : "font-medium text-amber-600"}>
                          {role}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-slate-600">{user.department ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
