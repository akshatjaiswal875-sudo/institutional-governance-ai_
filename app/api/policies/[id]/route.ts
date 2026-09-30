import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

const POLICY_MANAGERS = ["Director", "Principal", "HOD", "Coordinator", "Super Admin", "Meeting Secretary"] as const;
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try { const { supabase } = await requireUser(); const { data, error } = await supabase.from("policies").select("*").eq("id", params.id).maybeSingle(); if (error) throw error; return NextResponse.json({ data }); }
  catch { return NextResponse.json({ error: "Unable to load policy." }, { status: 401 }); }
}
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase, profile } = await requireUser([...POLICY_MANAGERS]);
    const body = await request.json(); const allowed = ["Draft", "Under Review", "Approved", "Archived"]; const status = allowed.includes(body.status) ? body.status : undefined;
    if (status === "Approved" && !["Director", "Super Admin"].includes(profile.role)) return NextResponse.json({ error: "Only the Director can give final policy approval." }, { status: 403 });
    const { data, error } = await supabase.from("policies").update({ title: body.title, content: body.content, status, effective_date: body.effectiveDate ?? null, updated_by: profile.id, updated_at: new Date().toISOString() }).eq("id", params.id).select("*").single();
    if (error) throw error;
    await recordAudit(supabase, profile.id, status === "Under Review" ? "SUBMIT_POLICY_FOR_REVIEW" : status === "Approved" ? "FINAL_APPROVE_POLICY" : "UPDATE_POLICY", "policies", params.id, { status, role: profile.role });
    return NextResponse.json({ data });
  } catch { return NextResponse.json({ error: "Unable to update policy." }, { status: 400 }); }
}
