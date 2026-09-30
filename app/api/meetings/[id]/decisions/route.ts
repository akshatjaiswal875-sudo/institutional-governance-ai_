import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

const statuses = ["Pending", "In Progress", "Completed"] as const;
const DECISION_MANAGERS = ["Director", "Principal", "HOD", "Coordinator"] as const;

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase, profile } = await requireUser([...DECISION_MANAGERS]);
    const body: unknown = await request.json();
    const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const decisionText = typeof input.decisionText === "string" ? input.decisionText.trim() : "";
    const actionItem = typeof input.actionItem === "string" ? input.actionItem.trim() : null;
    const assigneeId = typeof input.assigneeId === "string" && input.assigneeId ? input.assigneeId : null;
    const dueDate = typeof input.dueDate === "string" && input.dueDate ? input.dueDate : null;
    const status = statuses.includes(input.status as (typeof statuses)[number]) ? input.status as (typeof statuses)[number] : "Pending";
    if (!decisionText) return NextResponse.json({ error: "Decision text is required." }, { status: 400 });

    const [{ data: meeting }, { data: minute }] = await Promise.all([
      supabase.from("meetings").select("id").eq("id", params.id).maybeSingle(),
      supabase.from("minutes").select("id").eq("meeting_id", params.id).order("version", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (!meeting) return NextResponse.json({ error: "Meeting not found." }, { status: 404 });
    if (!minute) return NextResponse.json({ error: "Add minutes before adding a decision." }, { status: 400 });

    if (assigneeId) {
      const { data: assignee, error: assigneeError } = await supabase
        .from("users")
        .select("id, deleted_at")
        .eq("id", assigneeId)
        .maybeSingle();
      if (assigneeError) return NextResponse.json({ error: assigneeError.message }, { status: 400 });
      if (!assignee || assignee.deleted_at) return NextResponse.json({ error: "The selected assignee is not an active user." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("decisions")
      .insert({ meeting_id: params.id, minute_id: minute.id, decision_text: decisionText, action_item: actionItem, assignee_id: assigneeId, due_date: dueDate, status })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await recordAudit(supabase, profile.id, "ADD_DECISION", "decisions", data.id, { meeting_id: params.id, status });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (error instanceof Error && error.message === "FORBIDDEN") return NextResponse.json({ error: "You do not have permission to add decisions." }, { status: 403 });
    return NextResponse.json({ error: "Unable to add decision." }, { status: 500 });
  }
}
