import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/lib/audit";

const roles = ["Super Admin", "Meeting Secretary", "Faculty / Officer", "Member", "Auditor"] as const;

type Role = (typeof roles)[number];

export async function POST(request: Request) {
  try {
    const { profile, supabase } = await requireUser(["Super Admin"]);
    const body = await request.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const role = String(body.role ?? "Member") as Role;
    const department = String(body.department ?? "").trim() || null;

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (!roles.includes(role)) {
      return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 });
    }

    const admin = createAdminClient();
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin).replace(/\/$/, "");
    const redirectTo = `${appUrl}/auth/callback?next=/set-password`;

    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
    });

    if (inviteError || !invited.user) {
      return NextResponse.json({ error: inviteError?.message ?? "Unable to create the invited user." }, { status: 400 });
    }

    const { data: user, error: profileError } = await admin
      .from("users")
      .insert({ id: invited.user.id, email, role, department })
      .select("id,email,role,department,created_at")
      .single();

    if (profileError) {
      await admin.auth.admin.deleteUser(invited.user.id);
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    await recordAudit(supabase, profile.id, "USER_INVITED", "users", invited.user.id, {
      email,
      role,
      department,
    });

    return NextResponse.json({ data: user }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to invite user.";
    return NextResponse.json({ error: message === "FORBIDDEN" || message === "UNAUTHORIZED" ? "You are not allowed to invite users." : message }, { status: 403 });
  }
}
