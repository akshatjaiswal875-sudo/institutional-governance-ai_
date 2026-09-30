import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

const TRANSITIONS: Record<string, string[]> = {
  Pending: ["In Progress", "Completed"],
  "In Progress": ["Pending", "Completed"],
  Completed: ["In Progress"],
};
const GOVERNANCE_MANAGERS = ["Director", "Principal", "HOD", "Coordinator", "Super Admin", "Meeting Secretary"] as const;

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase, profile } = await requireUser([
      "Director", "Principal", "HOD", "Coordinator", "Super Admin", "Meeting Secretary", "Faculty / Officer", "Faculty / Volunteers",
    ]);
    const body = await request.json();
    const nextStatus = typeof body.status === "string" ? body.status.trim() : "";
    if (!["Pending", "In Progress", "Completed"].includes(nextStatus)) return NextResponse.json({ error: "Invalid action item status." }, { status: 400 });

    const { data: current, error: readError } = await supabase.from("action_items").select("id,status,assignee_id,created_by,meeting_id,task").eq("id", params.id).single();
    if (readError || !current) return NextResponse.json({ error: "Action item not found." }, { status: 404 });

    const canManage = GOVERNANCE_MANAGERS.includes(profile.role as typeof GOVERNANCE_MANAGERS[number]);
    const isAssignee = current.assignee_id === profile.id;
    const isCreator = current.created_by === profile.id;
    if (!canManage && !isAssignee && !isCreator) return NextResponse.json({ error: "You are not authorized to update this action item." }, { status: 403 });
    if (current.status === nextStatus) return NextResponse.json({ data: current });
    if (!TRANSITIONS[current.status]?.includes(nextStatus)) return NextResponse.json({ error: `Invalid status transition: ${current.status} → ${nextStatus}.` }, { status: 409 });

    const { data: updated, error: updateError } = await supabase.from("action_items").update({ status: nextStatus }).eq("id", params.id).select("*").single();
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });

    await recordAudit(supabase, profile.id, "ACTION_ITEM_STATUS_CHANGED", "action_items", params.id, { meeting_id: current.meeting_id, task: current.task, from_status: current.status, to_status: nextStatus });
    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (error instanceof Error && error.message === "FORBIDDEN") return NextResponse.json({ error: "You are not authorized to update this action item." }, { status: 403 });
    return NextResponse.json({ error: "Unable to update action item." }, { status: 500 });
  }
}
