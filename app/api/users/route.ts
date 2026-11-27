import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/lib/audit";

// Super Admin and Director can manage institutional accounts. Super Admin is
// intentionally not assignable through this endpoint to prevent escalation.
const assignableRoles = [
  "Director",
  "Principal",
  "HOD",
  "Coordinator",
  "Coordinators",
  "Faculty",
  "Faculty / Officer",
  "Faculty / Volunteers",
  "Meeting Secretary",
  "Member",
  "Auditor",
] as const;

const USER_ADMINS = ["Director", "Super Admin"] as const;

export async function GET() {
  try {
    // Authenticate and authorize with the caller's session first. Only after
    // that check do we use the server-only service client to read the directory.
    // This prevents the users table's self-only RLS policy from silently
    // returning just the current Super Admin's own row.
    await requireUser([...USER_ADMINS]);
    const admin = createAdminClient();
    const { data, error, count } = await admin
      .from("users")
      .select("id,email,role,department,created_at", { count: "exact" })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[api/users] Failed to list institutional users", {
        code: error.code,
        message: error.message,
      });
      return NextResponse.json({ error: "Unable to load users." }, { status: 500 });
    }

    return NextResponse.json(
      { data: data ?? [], count: count ?? data?.length ?? 0 },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load users.";
    const status = message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 500;
    if (status === 500) console.error("[api/users] Unexpected user-list failure", message);
    return NextResponse.json(
      { error: status === 403 ? "You do not have permission to manage users." : status === 401 ? "Please sign in to continue." : "Unable to load users." },
      { status },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const { supabase, profile } = await requireUser([...USER_ADMINS]);
    const body = await request.json();
    if (!body || typeof body.id !== "string" || !body.id.trim()) {
      return NextResponse.json({ error: "A valid user ID is required." }, { status: 400 });
    }
    if (!assignableRoles.includes(body.role)) {
      return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    }
    if (body.id === profile.id && body.role !== profile.role) {
      return NextResponse.json({ error: "You cannot change your own role." }, { status: 400 });
    }

    // Same authorization boundary as GET: role checked above, service client
    // performs the cross-user write without depending on a potentially
    // restrictive row-level policy. Never expose this client to the browser.
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("users")
      .update({
        role: body.role,
        department: typeof body.department === "string" ? body.department.trim() || null : null,
      })
      .eq("id", body.id)
      .select("id,email,role,department")
      .maybeSingle();

    if (error) {
      console.error("[api/users] Failed to update user", { code: error.code, message: error.message });
      return NextResponse.json({ error: "Unable to update user." }, { status: 400 });
    }
    if (!data) return NextResponse.json({ error: "User not found." }, { status: 404 });

    await recordAudit(supabase, profile.id, "ROLE_CHANGE", "users", body.id, {
      role: body.role,
      changed_by_role: profile.role,
    });
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update user.";
    const status = message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 500;
    if (status === 500) console.error("[api/users] Unexpected user-update failure", message);
    return NextResponse.json(
      { error: status === 403 ? "You do not have permission to manage users." : status === 401 ? "Please sign in to continue." : "Unable to update user." },
      { status },
    );
  }
}
