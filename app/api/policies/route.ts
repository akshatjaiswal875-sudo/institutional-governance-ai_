import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

export async function GET() {
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.from("policies").select("*").order("updated_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    return NextResponse.json({ error: "Unable to load policies." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, profile } = await requireUser(["Super Admin", "Meeting Secretary"]);
    const body = await request.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!title || !content) return NextResponse.json({ error: "Title and content are required." }, { status: 400 });

    const effectiveDate = typeof body.effectiveDate === "string" && body.effectiveDate ? body.effectiveDate : null;
    const { data, error } = await supabase.from("policies").insert({
      title,
      content,
      version: 1,
      status: "Draft",
      effective_date: effectiveDate,
      updated_by: profile.id,
    }).select("id,title,content,version,status,effective_date,updated_by,updated_at").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const { error: versionError } = await supabase.from("policy_versions").insert({
      policy_id: data.id,
      version: 1,
      title: data.title,
      content: data.content,
      status: data.status,
      effective_date: data.effective_date,
      change_reason: "Initial policy version",
      created_by: profile.id,
    });
    if (versionError) {
      await supabase.from("policies").delete().eq("id", data.id);
      return NextResponse.json({ error: "Policy was not created because its version history could not be initialized." }, { status: 500 });
    }

    await recordAudit(supabase, profile.id, "CREATE_POLICY", "policies", data.id, { title, version: 1 });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (error instanceof Error && error.message === "FORBIDDEN") return NextResponse.json({ error: "You do not have permission to create policies." }, { status: 403 });
    return NextResponse.json({ error: "Unable to create policy." }, { status: 500 });
  }
}
