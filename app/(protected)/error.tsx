"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function ProtectedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep diagnostics available without exposing server details to the user.
    console.error("[protected-route] Page rendering failed", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-2xl items-center justify-center px-4 py-12">
      <section
        className="w-full rounded-2xl border border-amber-200 bg-white p-6 shadow-sm sm:p-8"
        role="alert"
        aria-live="assertive"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
          <AlertTriangle size={22} aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-xl font-semibold text-slate-900">
          This page couldn&apos;t be loaded
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Your session and saved institutional data have not been changed. You can retry this page or return to your dashboard.
        </p>
        {error.digest && (
          <p className="mt-3 text-xs text-slate-400">
            Reference: {error.digest}
          </p>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            <RefreshCw size={16} aria-hidden="true" />
            Try again
          </button>
          <Link
            href="/dashboard"
            className="inline-flex min-h-10 items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Back to dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
