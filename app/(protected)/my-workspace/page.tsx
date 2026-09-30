import { ClipboardList, Sparkles } from "lucide-react";
import { TaskWorkspace } from "@/components/task-workspace";

export default function MyWorkspacePage() {
  return <main className="mx-auto w-full max-w-[1500px] space-y-7 px-4 py-8 sm:px-6 lg:px-8"><div><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.22em] text-[#AAAE7F]"><Sparkles size={14} /> Personal workspace</div><div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-black tracking-tight sm:text-4xl">My Workspace</h1><p className="mt-2 max-w-2xl text-sm text-[#D8D8F6]/55">Every task assigned to you, its deadline, progress and submitted completion report in one place.</p></div><ClipboardList className="text-[#AAAE7F]" size={30} /></div></div><TaskWorkspace /></main>;
}
