import { ClipboardList, ShieldCheck } from "lucide-react";
import { TaskWorkspace } from "@/components/task-workspace";

export default function DelegatedTasksPage() {
  return <main className="mx-auto w-full max-w-[1500px] space-y-7 px-4 py-8 sm:px-6 lg:px-8"><div><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.22em] text-[#AAAE7F]"><ShieldCheck size={14} /> Management workspace</div><div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-black tracking-tight sm:text-4xl">Delegated Tasks</h1><p className="mt-2 max-w-2xl text-sm text-[#D8D8F6]/55">Track every task you assigned from your meetings, including assignee progress, deadlines and submitted reports.</p></div><ClipboardList className="text-[#AAAE7F]" size={30} /></div></div><TaskWorkspace delegated /></main>;
}
