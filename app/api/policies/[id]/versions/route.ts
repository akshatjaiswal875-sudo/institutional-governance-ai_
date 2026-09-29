import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase
      .from("policy_versions")
      .select("id, policy_id, version, title, content, status, effective_date, change_reason, created_by, created_at")
      .eq("policy_id", params.id)
      .order("version", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ data: data ?? [] });
  } catch {
    return NextResponse.json({ error: "Unable to load policy history." }, { status: 400 });
  }
}
