import Link from "next/link";
import {
  ArrowUpRight,
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Mic2,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

const samples = [
  {
    title: "Academic Council Review",
    type: "Governance meeting",
    date: "28 Sep 2026 · 10:30 AM",
    status: "Published",
    people: "12 participants",
    summary: "Reviewed curriculum updates, faculty workload and the next accreditation milestone.",
    accent: "from-cyan-500/20 via-sky-500/10 to-transparent",
    icon: CalendarDays,
  },
  {
    title: "Infrastructure Committee",
    type: "Operations",
    date: "26 Sep 2026 · 3:00 PM",
    status: "Approved",
    people: "8 participants",
    summary: "Budget priorities were aligned for the new lab, smart classrooms and campus network upgrade.",
    accent: "from-violet-500/20 via-fuchsia-500/10 to-transparent",
    icon: ShieldCheck,
  },
  {
    title: "Student Affairs Review",
    type: "Student governance",
    date: "24 Sep 2026 · 11:15 AM",
    status: "AI processed",
    people: "15 participants",
    summary: "Captured student concerns, owners and deadlines for hostel, placement and welfare actions.",
    accent: "from-emerald-500/20 via-teal-500/10 to-transparent",
    icon: Users,
  },
];

const insights = [
  ["Executive summary", "Curriculum revision approved with a follow-up review scheduled for next month."],
  ["Key decision", "Department heads will submit updated workload plans before the review deadline."],
  ["Action item", "Registrar's office to circulate the revised academic calendar to all departments."],
];

export function DemoShowcase() {
  return (
    <section className="relative overflow-hidden rounded-[28px] border border-slate-800/80 bg-slate-950/80 p-5 shadow-2xl shadow-cyan-950/20 sm:p-7">
      <div className="pointer-events-none absolute -right-28 -top-28 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-violet-500/10 blur-3xl" />

      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
            <Sparkles size={13} /> Live demo workspace
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">See how Meeting Intelligence turns conversations into governance records.</h2>
          <p className="mt-3 text-sm leading-6 text-slate-400 sm:text-base">Explore realistic sample meetings, AI-generated insights and accountable action items before adding your own institutional data.</p>
        </div>
        <Link href="/meetings/new" className="btn btn-primary group shrink-0 rounded-xl px-5 py-3">
          Create a real meeting <ArrowUpRight size={16} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </Link>
      </div>

      <div className="relative mt-7 grid gap-4 xl:grid-cols-3">
        {samples.map((sample) => {
          const Icon = sample.icon;
          return (
            <article key={sample.title} className={`group overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br ${sample.accent} bg-slate-900/80 p-5 transition duration-200 hover:-translate-y-1 hover:border-cyan-400/30 hover:shadow-xl hover:shadow-cyan-950/20`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-cyan-300"><Icon size={20} /></div>
                <span className="badge">{sample.status}</span>
              </div>
              <p className="mt-5 text-xs font-medium uppercase tracking-wider text-slate-500">{sample.type}</p>
              <h3 className="mt-1 text-lg font-semibold text-white">{sample.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">{sample.summary}</p>
              <div className="mt-5 flex flex-wrap gap-3 border-t border-white/5 pt-4 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1.5"><Clock3 size={13} /> {sample.date}</span>
                <span className="inline-flex items-center gap-1.5"><Users size={13} /> {sample.people}</span>
              </div>
            </article>
          );
        })}
      </div>

      <div className="relative mt-5 grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-400/10 text-violet-300"><BrainCircuit size={19} /></div>
              <div><p className="font-semibold text-white">AI meeting brief</p><p className="text-xs text-slate-500">Academic Council Review · demo output</p></div>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-300"><CheckCircle2 size={14} /> Ready</span>
          </div>
          <div className="mt-5 space-y-3">
            {insights.map(([label, value]) => <div key={label} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5"><p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-400">{label}</p><p className="mt-1 text-sm leading-5 text-slate-300">{value}</p></div>)}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300"><Mic2 size={19} /></div><div><p className="font-semibold text-white">Processing pipeline</p><p className="text-xs text-slate-500">From recording to accountable action</p></div></div>
          <div className="mt-5 space-y-2">
            {[
              ["01", "Recording captured", "Audio / video"],
              ["02", "Transcript generated", "Local Whisper"],
              ["03", "Meeting intelligence", "Summary + decisions"],
              ["04", "Actions tracked", "Owners + deadlines"],
            ].map(([step, title, meta]) => <div key={step} className="flex items-center gap-3 rounded-xl border border-slate-800/80 bg-slate-950/50 p-3"><span className="text-xs font-bold text-cyan-400">{step}</span><div className="min-w-0 flex-1"><p className="text-sm font-medium text-slate-200">{title}</p><p className="text-xs text-slate-500">{meta}</p></div><FileText size={15} className="text-slate-600" /></div>)}
          </div>
        </div>
      </div>

      <p className="relative mt-5 text-center text-xs text-slate-600">Demo content is illustrative only and is clearly separated from your real institutional records.</p>
    </section>
  );
}
