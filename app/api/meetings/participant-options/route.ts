import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    // Match the database can_manage_meetings() policy. Only governance
    // meeting managers may enumerate users for the participant picker.
    const { profile } = await requireUser([
      "Director",
      "Principal",
      "HOD",
      "Coordinator",
      "Super Admin",
      "Meeting Secretary",
    ]);
    const admin = createAdminClient();
    const pageSize = 500;
    const users: Array<{ id: string; email: string }> = [];

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await admin
        .from("users")
        .select("id,email")
        .order("email", { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) throw error;
      const page = data ?? [];
      users.push(...page);
      if (page.length < pageSize) break;
    }

    // Only return fields required by the participant picker; do not disclose
    // institutional roles or department assignments through this endpoint.
    return NextResponse.json(
      { data: users },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load participant options.";
    const status = message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : message === "PROFILE_NOT_FOUND" ? 403 : 500;
    console.error("[api/meetings/participant-options] Failed to load users:", message);
    return NextResponse.json(
      { error: status === 401 ? "Authentication required." : status === 403 ? "You do not have permission to view participant options." : "Unable to load participant options." },
      { status },
    );
  }
}
