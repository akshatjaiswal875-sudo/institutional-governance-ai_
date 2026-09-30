import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const ASSIGNERS = ["Director", "Principal", "HOD"] as const;

export async function GET(request: Request) {
  try {
    const { profile } = await requireUser();
    const admin = createAdminClient();
    const view = new URL(request.url).searchParams.get("view") === "delegated" ? "delegated" : "workspace";
    if (view === "delegated" && !ASSIGNERS.includes(profile.role as typeof ASSIGNERS[number])) return NextResponse.json({ error: "Only Director, Principal or HOD can access delegated task management." }, { status: 403 });

    const query = admin.from("action_items").select("*").order("due_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false });
    const { data: tasks, error } = view === "delegated" ? await query.eq("created_by", profile.id) : await query.eq("assignee_id", profile.id);
    if (error) throw error;

    const rows = tasks ?? [];
    const meetingIds = [...new Set(rows.map(row => row.meeting_id).filter(Boolean))];
    const userIds = [...new Set(rows.flatMap(row => [row.assignee_id, row.created_by]).filter(Boolean))];
    const reportIds = rows.map(row => row.id);
    const [{ data: meetings }, { data: users }, { data: reports }] = await Promise.all([
      meetingIds.length ? admin.from("meetings").select("id,title,date,location").in("id", meetingIds) : Promise.resolve({ data: [] as any[] }),
      userIds.length ? admin.from("users").select("id,email,role,department").in("id", userIds) : Promise.resolve({ data: [] as any[] }),
      reportIds.length ? admin.from("task_reports").select("id,action_item_id,submitted_by,file_name,mime_type,file_size,notes,created_at,file_path").in("action_item_id", reportIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [] as any[] }),
    ]);

    const meetingMap = new Map((meetings ?? []).map(item => [item.id, item]));
    const userMap = new Map((users ?? []).map(item => [item.id, item]));
    const reportsWithLinks = await Promise.all((reports ?? []).map(async report => { const { data } = await admin.storage.from("task-reports").createSignedUrl(report.file_path, 60 * 30); return { ...report, download_url: data?.signedUrl ?? null }; }));
    const reportsByTask = new Map<string, any[]>();
    for (const report of reportsWithLinks) { const list = reportsByTask.get(report.action_item_id) ?? []; list.push(report); reportsByTask.set(report.action_item_id, list); }

    return NextResponse.json({ data: rows.map(row => ({ ...row, meeting: meetingMap.get(row.meeting_id) ?? null, assignee: userMap.get(row.assignee_id) ?? null, creator: userMap.get(row.created_by) ?? null, reports: reportsByTask.get(row.id) ?? [] })), view, canAssign: ASSIGNERS.includes(profile.role as typeof ASSIGNERS[number]), currentUserId: profile.id });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    return NextResponse.json({ error: "Unable to load tasks." }, { status: 500 });
  }
}
