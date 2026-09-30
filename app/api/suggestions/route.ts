import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

const REVIEWERS = ["Director", "Principal", "HOD", "Coordinator", "Super Admin", "Meeting Secretary"] as const;

export async function GET() {
  try {
    const { supabase } = await requireUser([...REVIEWERS]);
    const { data, error } = await supabase.from("suggestions").select("*").order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load suggestions.";
    return NextResponse.json({ error: message }, { status: message === "FORBIDDEN" ? 403 : 401 });
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, profile } = await requireUser();
    const body = await request.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!title || !content) return NextResponse.json({ error: "Title and suggestion content are required." }, { status: 400 });
    const { data, error } = await supabase.from("suggestions").insert({ submitted_by: profile.id, title, content }).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await recordAudit(supabase, profile.id, "SUBMIT_SUGGESTION", "suggestions", data.id, { title });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to submit suggestion.";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
