import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/lib/audit";
import { canManageMeeting } from "@/lib/meeting-permissions";

const DEPARTMENT_ROLES = ["HOD", "Faculty / Officer"] as const;
const INSTITUTIONAL_ROLES = ["Director", "Principal", "Super Admin", "Meeting Secretary", "Coordinators", "Coordinator"] as const;

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase, profile } = await requireUser();
    const body = await request.json();
    const task = typeof body.task === "string" ? body.task.trim() : "";
    const assigneeId = typeof body.assigneeId === "string" ? body.assigneeId.trim() : "";
    const department = typeof body.department === "string" ? body.department.trim() : "";
    const requestedRole = typeof body.role === "string" ? body.role.trim() : "";
    const dueDate = typeof body.dueDate === "string" && body.dueDate ? body.dueDate : null;
    const priority = ["Low", "Medium", "High", "Critical"].includes(body.priority) ? body.priority : "Medium";
    if (!task) return NextResponse.json({ error: "Task is required." }, { status: 400 });
    if (!assigneeId) return NextResponse.json({ error: "Choose an eligible assignee." }, { status: 400 });

    const { data: meeting, error: meetingError } = await supabase.from("meetings").select("id,title,date,created_by").eq("id", params.id).maybeSingle();
    if (meetingError) throw meetingError;
    if (!meeting) return NextResponse.json({ error: "Meeting not found." }, { status: 404 });
    if (!canManageMeeting({ userId: profile.id, creatorId: meeting.created_by, role: profile.role })) return NextResponse.json({ error: "Only the meeting organizer can assign tasks for this meeting." }, { status: 403 });

    const departmentRole = (DEPARTMENT_ROLES as readonly string[]).includes(requestedRole);
    const institutionalRole = (INSTITUTIONAL_ROLES as readonly string[]).includes(requestedRole);
    if (!departmentRole && !institutionalRole) return NextResponse.json({ error: "Invalid assignee role." }, { status: 400 });
    if (departmentRole && !department) return NextResponse.json({ error: "Select a department for HOD or faculty assignment." }, { status: 400 });

    const admin = createAdminClient();
    let assigneeQuery = admin.from("users").select("id,email,role,department").eq("id", assigneeId).eq("role", requestedRole);
    if (departmentRole) assigneeQuery = assigneeQuery.eq("department", department);
    const { data: assignee, error: assigneeError } = await assigneeQuery.maybeSingle();
    if (assigneeError) throw assigneeError;
    if (!assignee) return NextResponse.json({ error: "This account does not match the selected role and department. Refresh the list and choose again." }, { status: 400 });
    if (assignee.id === profile.id) return NextResponse.json({ error: "Assign the task to another member." }, { status: 400 });

    const { data, error } = await admin.from("action_items").insert({ meeting_id: params.id, decision_id: body.decisionId || null, task, assignee_id: assignee.id, due_date: dueDate, priority, status: "Pending", created_by: profile.id }).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await admin.from("notifications").insert({
      user_id: assignee.id,
      type: "task",
      title: "New task assigned",
      message: `${profile.email} assigned you: ${task}`,
      target_table: "action_items",
      target_id: data.id,
    });
    await recordAudit(admin, profile.id, "ADD_DELEGATED_TASK", "action_items", data.id, { meeting_id: params.id, assignee_id: assignee.id, assignee_email: assignee.email, assignee_role: assignee.role, department: assignee.department, due_date: dueDate });
    return NextResponse.json({ data: { ...data, assignee } }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (error instanceof Error && error.message === "FORBIDDEN") return NextResponse.json({ error: "Only the meeting creator can assign tasks." }, { status: 403 });
    console.error("[meetings/actions] task assignment failed", error);
    return NextResponse.json({ error: "Unable to assign the task." }, { status: 500 });
  }
}
