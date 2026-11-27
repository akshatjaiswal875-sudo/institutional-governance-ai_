import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

const STATUS_MANAGERS = ["Coordinator", "Coordinators", "Meeting Secretary"] as const;
const STATUSES = ["Submitted", "Under Review", "Accepted", "Rejected", "Implemented"] as const;

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase, profile } = await requireUser([...STATUS_MANAGERS]);
    const body = await request.json();
    const status = typeof body.status === "string" ? body.status : "";
    const reviewNotes = typeof body.reviewNotes === "string" ? body.reviewNotes.trim() || null : null;
    if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
      return NextResponse.json({ error: "Invalid suggestion status." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("suggestions")
      .update({ status, reviewer_id: profile.id, review_notes: reviewNotes, updated_at: new Date().toISOString() })
      .eq("id", params.id)
      .is("deleted_at", null)
      .select("*")
      .maybeSingle();

    if (error) return NextResponse.json({ error: "Unable to update suggestion." }, { status: 400 });
    if (!data) return NextResponse.json({ error: "Suggestion not found or not accessible." }, { status: 404 });

    await recordAudit(supabase, profile.id, "REVIEW_SUGGESTION", "suggestions", params.id, { status, review_notes: reviewNotes });
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to review suggestion.";
    const status = message === "FORBIDDEN" ? 403 : 401;
    return NextResponse.json({ error: status === 403 ? "This role has read-only access to suggestions." : "Please sign in to continue." }, { status });
  }
}
