import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase, profile } = await requireUser(["Super Admin", "Meeting Secretary"]);
    const body = await request.json();
    const analysisId = typeof body.analysisId === "string" ? body.analysisId : "";
    if (!analysisId) return NextResponse.json({ error: "Analysis is required." }, { status: 400 });
    const { data: analysis } = await supabase.from("meeting_ai_analysis").select("*").eq("id", analysisId).eq("meeting_id", params.id).maybeSingle();
    if (!analysis) return NextResponse.json({ error: "AI analysis not found." }, { status: 404 });
    if (analysis.status === "approved") return NextResponse.json({ data: { id: analysis.id, status: analysis.status } });

    const summary = typeof body.summary === "string" ? body.summary : analysis.summary;
    const suggestedMinutes = typeof body.suggestedMinutes === "string" ? body.suggestedMinutes : analysis.suggested_minutes;
    const decisions = Array.isArray(body.decisions) ? body.decisions : analysis.extracted_decisions;
    const actionItems = Array.isArray(body.actionItems) ? body.actionItems : analysis.extracted_action_items;

    const { data: latest } = await supabase.from("minutes").select("id,version,raw_transcript,summary,is_approved").eq("meeting_id", params.id).order("version", { ascending: false }).limit(1).maybeSingle();
    let minuteId: string;
    if (latest && latest.is_approved && latest.raw_transcript === suggestedMinutes && latest.summary === summary) {
      minuteId = latest.id;
    } else {
      const version = (latest?.version ?? 0) + 1;
      const { data: minute, error } = await supabase.from("minutes").insert({ meeting_id: params.id, raw_transcript: suggestedMinutes, summary, version, is_approved: true }).select("id").single();
      if (error) throw error;
      minuteId = minute.id;
    }

    for (const decision of decisions) {
      if (typeof decision?.decision_text !== "string" || !decision.decision_text.trim()) continue;
      const { data: existing } = await supabase.from("decisions").select("id").eq("minute_id", minuteId).eq("decision_text", decision.decision_text.trim()).limit(1).maybeSingle();
      if (existing) continue;
      const { error } = await supabase.from("decisions").insert({ meeting_id: params.id, minute_id: minuteId, decision_text: decision.decision_text.trim(), action_item: typeof decision.action_item === "string" ? decision.action_item : null, assignee_id: typeof decision.assignee_id === "string" ? decision.assignee_id : null, due_date: typeof decision.due_date === "string" ? decision.due_date : null, status: "Pending" });
      if (error) throw error;
    }

    for (const item of actionItems) {
      if (typeof item?.task !== "string" || !item.task.trim()) continue;
      let assigneeId = typeof item.assignee_id === "string" ? item.assignee_id : null;
      if (!assigneeId && typeof item.assignee_email === "string" && item.assignee_email.trim()) {
        const { data: assignee } = await supabase.from("users").select("id").eq("email", item.assignee_email.trim().toLowerCase()).maybeSingle();
        assigneeId = assignee?.id ?? null;
      }
      const { data: existing } = await supabase.from("action_items").select("id").eq("meeting_id", params.id).eq("task", item.task.trim()).limit(1).maybeSingle();
      if (existing) continue;
      const { error } = await supabase.from("action_items").insert({ meeting_id: params.id, task: item.task.trim(), assignee_id: assigneeId, due_date: item.deadline ?? null, priority: ["Low", "Medium", "High", "Critical"].includes(item.priority) ? item.priority : "Medium", status: "Pending", created_by: profile.id });
      if (error) throw error;
    }

    const { data: updated, error: updateError } = await supabase.from("meeting_ai_analysis").update({ summary, suggested_minutes: suggestedMinutes, extracted_decisions: decisions, extracted_action_items: actionItems, status: "approved", updated_at: new Date().toISOString() }).eq("id", analysisId).select("id,status").single();
    if (updateError) throw updateError;
    await recordAudit(supabase, profile.id, "AI_RESULT_APPROVED", "meeting_ai_analysis", analysisId, { meeting_id: params.id, minutes_id: minuteId });
    return NextResponse.json({ data: updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to approve AI results." }, { status: 400 });
  }
}
