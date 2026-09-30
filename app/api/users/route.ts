import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

const roles = ["Super Admin", "Meeting Secretary", "Faculty / Officer", "Member", "Auditor", "Director", "Principal", "HOD", "Coordinators", "Faculty / Volunteers"] as const;
const USER_ADMINS = ["Director", "Super Admin"] as const;

export async function GET() {
  try {
    const { supabase } = await requireUser(["Director", "Super Admin", "Auditor"]);
    const { data, error } = await supabase.from("users").select("id,email,role,department,created_at").order("created_at");
    if (error) throw error;
    return NextResponse.json({ data: data ?? [] });
  } catch { return NextResponse.json({ error: "Unable to load users." }, { status: 403 }); }
}

export async function PATCH(request: Request) {
  try {
    const { supabase, profile } = await requireUser([...USER_ADMINS]);
    const body = await request.json();
    if (!roles.includes(body.role)) return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    if (body.id === profile.id && body.role !== profile.role) return NextResponse.json({ error: "You cannot change your own role." }, { status: 400 });
    const { data, error } = await supabase.from("users").update({ role: body.role, department: body.department ?? null }).eq("id", body.id).select("id,email,role,department").single();
    if (error) throw error;
    await recordAudit(supabase, profile.id, "ROLE_CHANGE", "users", body.id, { role: body.role, changed_by_role: profile.role });
    return NextResponse.json({ data });
  } catch { return NextResponse.json({ error: "Unable to update user." }, { status: 400 }); }
}
