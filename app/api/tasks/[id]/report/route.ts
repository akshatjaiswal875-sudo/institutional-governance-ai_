import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/lib/audit";

const MAX_SIZE = 25 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
]);

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { profile } = await requireUser();
    const admin = createAdminClient();
    const { data: task, error: taskError } = await admin.from("action_items").select("id,task,status,assignee_id,created_by,meeting_id").eq("id", params.id).maybeSingle();
    if (taskError) throw taskError;
    if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });
    if (task.assignee_id !== profile.id) return NextResponse.json({ error: "Only the assigned user can submit a task report." }, { status: 403 });
    if (task.status !== "Completed") return NextResponse.json({ error: "Mark the task as Completed before submitting the report." }, { status: 400 });

    const form = await request.formData();
    const file = form.get("file");
    const notes = typeof form.get("notes") === "string" ? String(form.get("notes")).trim() : "";
    if (!(file instanceof File)) return NextResponse.json({ error: "A report file is required." }, { status: 400 });
    if (file.size <= 0 || file.size > MAX_SIZE) return NextResponse.json({ error: "Report must be non-empty and 25 MB or smaller." }, { status: 400 });
    if (file.type && !ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: "Upload PDF, Word, Excel, or text report files only." }, { status: 400 });

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "report";
    const path = `${task.id}/${profile.id}/${crypto.randomUUID()}-${safeName}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: uploadError } = await admin.storage.from("task-reports").upload(path, bytes, { contentType: file.type || "application/octet-stream", upsert: false });
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 400 });

    const { data: report, error: reportError } = await admin.from("task_reports").insert({ action_item_id: task.id, submitted_by: profile.id, file_path: path, file_name: safeName, mime_type: file.type || null, file_size: file.size, notes: notes || null }).select("id,action_item_id,file_name,file_size,mime_type,notes,created_at").single();
    if (reportError) {
      await admin.storage.from("task-reports").remove([path]);
      throw reportError;
    }

    await admin.from("notifications").insert({
      user_id: task.created_by,
      type: "task",
      title: "Task report submitted",
      message: `${profile.email} submitted a report for: ${task.task}`,
      target_table: "action_items",
      target_id: task.id,
    });
    await recordAudit(admin, profile.id, "TASK_REPORT_SUBMITTED", "task_reports", report.id, { action_item_id: task.id, meeting_id: task.meeting_id, file_name: safeName });
    return NextResponse.json({ data: report }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    return NextResponse.json({ error: "Unable to submit the task report." }, { status: 500 });
  }
}
