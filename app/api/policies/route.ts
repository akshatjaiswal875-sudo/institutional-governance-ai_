import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

const POLICY_CREATORS = ["Director", "Principal", "HOD", "Coordinator", "Super Admin"] as const;

export async function GET() {
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.from("policies").select("*").order("updated_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ data: data ?? [] });
  } catch { return NextResponse.json({ error: "Unable to load policies." }, { status: 401 }); }
}

export async function POST(request: Request) {
  try {
    const { supabase, profile } = await requireUser([...POLICY_CREATORS]);
    const body = await request.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!title || !content) return NextResponse.json({ error: "Title and content are required." }, { status: 400 });
    const { data, error } = await supabase.from("policies").insert({ title, content, version: 1, status: "Draft", effective_date: typeof body.effectiveDate === "string" && body.effectiveDate ? body.effectiveDate : null, updated_by: profile.id }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await recordAudit(supabase, profile.id, "CREATE_POLICY", "policies", data.id, { title, creator_role: profile.role });
    return NextResponse.json({ data }, { status: 201 });
  } catch { return NextResponse.json({ error: "Unable to create policy." }, { status: 401 }); }
}
