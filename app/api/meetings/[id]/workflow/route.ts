import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";

const actions = ["assign", "submit", "approve", "reject", "publish"] as const;
type WorkflowAction = (typeof actions)[number];

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase, profile } = await requireUser();
    const body = await request.json();
    const action = body.action as WorkflowAction;
    if (!actions.includes(action)) return NextResponse.json({ error: "Invalid workflow action." }, { status: 400 });

    const { data: meeting } = await supabase.from("meetings").select("id,status,assigned_approver_id,created_by").eq("id", params.id).maybeSingle();
    if (!meeting) return NextResponse.json({ error: "Meeting not found." }, { status: 404 });

    let nextStatus = meeting.status;
    let assignedApproverId = meeting.assigned_approver_id;

    if (action === "assign") {
      if (!["Super Admin", "Meeting Secretary"].includes(profile.role)) return NextResponse.json({ error: "You cannot assign an approver." }, { status: 403 });
      const approverEmail = typeof body.approverEmail === "string" ? body.approverEmail.trim().toLowerCase() : "";
      if (!approverEmail) return NextResponse.json({ error: "Select an approver by email." }, { status: 400 });

      const admin = createAdminClient();
      const { data: approver, error } = await admin.from("users").select("id,email,role").eq("email", approverEmail).maybeSingle();
      if (error) throw error;
      if (!approver || approver.role !== "Faculty / Officer") return NextResponse.json({ error: "That user is not eligible to approve meetings." }, { status: 400 });
      assignedApproverId = approver.id;
    } else if (action === "submit") {
      if (!["Super Admin", "Meeting Secretary"].includes(profile.role)) return NextResponse.json({ error: "You cannot submit this meeting." }, { status: 403 });
      if (!assignedApproverId) return NextResponse.json({ error: "Assign an approver before submitting." }, { status: 400 });
      if (!["Draft", "Rejected", "Transcribed"].includes(meeting.status)) return NextResponse.json({ error: "Only draft, rejected, or transcribed meetings can be submitted." }, { status: 400 });
      nextStatus = "Pending Approval";
    } else if (action === "approve" || action === "reject") {
      if (profile.role !== "Super Admin" && profile.role !== "Faculty / Officer") return NextResponse.json({ error: "You cannot review this meeting." }, { status: 403 });
      if (profile.role === "Faculty / Officer" && meeting.assigned_approver_id !== profile.id) return NextResponse.json({ error: "Only the assigned approver can review this meeting." }, { status: 403 });
      if (meeting.status !== "Pending Approval") return NextResponse.json({ error: "Only pending meetings can be reviewed." }, { status: 400 });
      nextStatus = action === "approve" ? "Approved" : "Rejected";
    } else {
      if (profile.role !== "Super Admin") return NextResponse.json({ error: "Only a Super Admin can publish meetings." }, { status: 403 });
      if (meeting.status !== "Approved") return NextResponse.json({ error: "Only approved meetings can be published." }, { status: 400 });
      nextStatus = "Published";
    }

    const { data, error } = await supabase.from("meetings").update({ assigned_approver_id: assignedApproverId, status: nextStatus }).eq("id", params.id).select("id,status,assigned_approver_id").single();
    if (error) throw error;
    await recordAudit(supabase, profile.id, action === "assign" ? "ASSIGN_APPROVER" : `${action.toUpperCase()}_MEETING`, "meetings", params.id, { status: nextStatus, assigned_approver_id: assignedApproverId });
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (error instanceof Error && error.message === "FORBIDDEN") return NextResponse.json({ error: "You do not have permission to update meeting workflow." }, { status: 403 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update meeting workflow." }, { status: 500 });
  }
}
