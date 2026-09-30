import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/lib/audit";

const ACTION_CREATORS = ["Director", "Principal", "HOD"] as const;

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase, profile } = await requireUser([...ACTION_CREATORS]);
    const body = await request.json();
    const task = typeof body.task === "string" ? body.task.trim() : "";
    const assigneeEmail = typeof body.assigneeEmail === "string" ? body.assigneeEmail.trim().toLowerCase() : "";
    const dueDate = typeof body.dueDate === "string" && body.dueDate ? body.dueDate : null;
    const priority = ["Low", "Medium", "High", "Critical"].includes(body.priority) ? body.priority : "Medium";
    if (!task) return NextResponse.json({ error: "Task is required." }, { status: 400 });
    if (!assigneeEmail || !assigneeEmail.includes("@")) return NextResponse.json({ error: "Assignee email is required." }, { status: 400 });

    const { data: meeting, error: meetingError } = await supabase.from("meetings").select("id,title,date,created_by").eq("id", params.id).maybeSingle();
    if (meetingError) throw meetingError;
    if (!meeting) return NextResponse.json({ error: "Meeting not found." }, { status: 404 });
    if (meeting.created_by !== profile.id) return NextResponse.json({ error: "Only the meeting organizer can assign tasks for this meeting." }, { status: 403 });

    const admin = createAdminClient();
    const { data: assignee, error: assigneeError } = await admin.from("users").select("id,email,role,department").ilike("email", assigneeEmail).maybeSingle();
    if (assigneeError) throw assigneeError;
    if (!assignee) return NextResponse.json({ error: "No user was found with that email address." }, { status: 404 });
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
    await recordAudit(admin, profile.id, "ADD_DELEGATED_TASK", "action_items", data.id, { meeting_id: params.id, assignee_id: assignee.id, assignee_email: assignee.email, due_date: dueDate });
    return NextResponse.json({ data: { ...data, assignee } }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (error instanceof Error && error.message === "FORBIDDEN") return NextResponse.json({ error: "Only Director, Principal or HOD can assign tasks." }, { status: 403 });
    return NextResponse.json({ error: "Unable to assign the task." }, { status: 500 });
  }
}
