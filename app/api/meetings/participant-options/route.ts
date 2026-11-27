import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    // The same authenticated meeting-creator boundary used by the existing
    // meeting participant picker. Never expose the service-role client.
    await requireUser();
    const admin = createAdminClient();
    const pageSize = 500;
    const users: Array<{ id: string; email: string; role: string; department: string | null }> = [];

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await admin
        .from("users")
        .select("id,email,role,department")
        .order("email", { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) throw error;
      const page = data ?? [];
      users.push(...page);
      if (page.length < pageSize) break;
    }

    return NextResponse.json(
      { data: users },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load participant options.";
    const status = message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 500;
    console.error("[api/meetings/participant-options] Failed to load users:", message);
    return NextResponse.json(
      { error: status === 401 ? "Authentication required." : status === 403 ? "You do not have permission to view participant options." : "Unable to load participant options." },
      { status },
    );
  }
}
