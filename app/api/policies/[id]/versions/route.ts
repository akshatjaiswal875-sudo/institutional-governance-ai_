import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requireUser();
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Policy id is required." }, { status: 400 });
    const { data, error } = await supabase
      .from("policy_versions")
      .select("id,policy_id,version,title,content,status,effective_date,change_reason,created_by,approved_by,created_at")
      .eq("policy_id", id)
      .order("version", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    return NextResponse.json({ error: "Unable to load policy history." }, { status: 500 });
  }
}
