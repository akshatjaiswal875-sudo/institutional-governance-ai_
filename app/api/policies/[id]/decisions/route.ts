import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

const POLICY_DECISION_MANAGERS = ["Director", "Principal", "HOD", "Coordinator", "Super Admin", "Meeting Secretary", "Faculty / Officer"] as const;

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.from("policy_decision_links").select("id, policy_id, decision_id, created_by, created_at, decisions:decision_id(id, meeting_id, minute_id, decision_text, action_item, assignee_id, due_date, status)").eq("policy_id", params.id).order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ data: data ?? [] });
  } catch { return NextResponse.json({ error: "Unable to load linked decisions." }, { status: 400 }); }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase, profile } = await requireUser([...POLICY_DECISION_MANAGERS]);
    const body = await request.json();
    if (typeof body.decisionId !== "string" || !body.decisionId) return NextResponse.json({ error: "decisionId is required." }, { status: 400 });
    const { data, error } = await supabase.from("policy_decision_links").insert({ policy_id: params.id, decision_id: body.decisionId, created_by: profile.id }).select("id, policy_id, decision_id, created_by, created_at").single();
    if (error) throw error;
    return NextResponse.json({ data }, { status: 201 });
  } catch (error: any) { return NextResponse.json({ error: error?.code === "23505" ? "Decision is already linked to this policy." : "Unable to link decision." }, { status: 400 }); }
}
