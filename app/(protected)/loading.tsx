export default function ProtectedLoading() {
  return (
    <div className="min-h-[calc(100vh-72px)] animate-pulse p-3 sm:p-5 lg:p-8" aria-label="Loading page" role="status">
      <div className="mx-auto max-w-[1800px] space-y-5">
        <div className="h-10 w-56 rounded-2xl bg-slate-200/80" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-28 rounded-2xl border border-slate-200 bg-white" />)}
        </div>
        <div className="h-[420px] rounded-3xl border border-slate-200 bg-white" />
      </div>
      <span className="sr-only">Loading page…</span>
    </div>
  );
}
