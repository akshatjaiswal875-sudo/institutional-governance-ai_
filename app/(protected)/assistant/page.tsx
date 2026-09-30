import Link from "next/link";
import { Search } from "lucide-react";

export default function Assistant() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">AI Governance Assistant</h1>
        <p className="mt-2 text-slate-400">AI assistant features are temporarily unavailable.</p>
      </div>

      <section className="card p-6">
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300" role="status">
          AI assistant is currently unavailable.
        </div>

        <div className="mt-6 rounded-xl border border-slate-700/80 bg-slate-900/60 p-5">
          <h2 className="text-lg font-semibold text-white">Hybrid Search is available</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Use institutional search to find meetings, events, policies, decisions and action items while AI generation features are paused.
          </p>
          <Link href="/search" className="btn btn-primary mt-4 inline-flex items-center gap-2">
            <Search size={16} />
            Open Hybrid Search
          </Link>
        </div>
      </section>
    </div>
  );
}
