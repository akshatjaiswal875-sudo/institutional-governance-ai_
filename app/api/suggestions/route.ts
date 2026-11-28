import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/lib/audit";

const READ_ONLY_LEADERS = ["Super Admin", "Director", "Principal", "HOD"] as const;
const SUGGESTION_VIEWERS = [...READ_ONLY_LEADERS, "Coordinator", "Coordinators", "Meeting Secretary"] as const;
const SUBMISSION_BLOCKED_ROLES = new Set<string>(READ_ONLY_LEADERS);

type SuggestionRow = {
  id: string;
  submitted_by: string;
  title: string;
  content: string;
  status: string;
  reviewer_id: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
  policy_tags?: Array<{ policies?: { id: string; custom_id: string; title: string; status?: string | null; deleted_at?: string | null } | null }>;
  event_tags?: Array<{ events?: { id: string; custom_id: string; title: string; deleted_at?: string | null } | null }>;
  submitter?: { id: string; email: string; role: string; department: string | null } | null;
};

export async function GET() {
  try {
    const { profile } = await requireUser([...SUGGESTION_VIEWERS]);
    const admin = createAdminClient();
    const selection = `
      id, submitted_by, title, content, status, reviewer_id, review_notes, created_at, updated_at,
      policy_tags:suggestion_policy_tags(
        policies:policy_id(id, custom_id, title, status, deleted_at)
      ),
      event_tags:suggestion_event_tags(
        events:event_id(id, custom_id, title, deleted_at)
      ),
      submitter:users!suggestions_submitted_by_fkey(id, email, role, department)
    `;
    const allSuggestions: SuggestionRow[] = [];
    const pageSize = 500;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await admin
        .from("suggestions")
        .select(selection)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) {
        console.error("[api/suggestions] Failed to load suggestions", { code: error.code, message: error.message, offset: from });
        return NextResponse.json({ error: "Unable to load suggestions." }, { status: 500 });
      }
      const page = (data ?? []) as unknown as SuggestionRow[];
      allSuggestions.push(...page);
      if (page.length < pageSize) break;
    }

    const rows = allSuggestions
      .filter((item) => {
        if (profile.role !== "HOD") return true;
        const ownDepartment = profile.department?.trim().toLocaleLowerCase();
        const submitterDepartment = item.submitter?.department?.trim().toLocaleLowerCase();
        return Boolean(ownDepartment && submitterDepartment && ownDepartment === submitterDepartment);
      })
      .map((item) => {
        const policyTags = (item.policy_tags ?? []).flatMap((entry) => {
          const policy = entry.policies;
          return policy && !policy.deleted_at
            ? [{ id: policy.id, type: "policy" as const, customId: policy.custom_id, title: policy.title, archived: policy.status === "Archived" }]
            : [];
        });
        const eventTags = (item.event_tags ?? []).flatMap((entry) => {
          const event = entry.events;
          return event && !event.deleted_at
            ? [{ id: event.id, type: "event" as const, customId: event.custom_id, title: event.title }]
            : [];
        });
        return { ...item, policy_tags: policyTags, event_tags: eventTags };
      });

    return NextResponse.json(
      {
        data: rows,
        count: rows.length,
        scope: profile.role === "HOD" ? "department" : "institution",
        department: profile.role === "HOD" ? profile.department : null,
      },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load suggestions.";
    const status = message === "FORBIDDEN" ? 403 : 401;
    return NextResponse.json({ error: status === 403 ? "You do not have permission to view suggestions." : "Please sign in to continue." }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, profile } = await requireUser();
    if (SUBMISSION_BLOCKED_ROLES.has(profile.role)) {
      return NextResponse.json({ error: "This role has read-only access to suggestions." }, { status: 403 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const content = typeof body.content === "string" ? body.content.trim() : "";
    const policyIds = Array.isArray(body.taggedPolicyIds) ? body.taggedPolicyIds : [];
    const eventIds = Array.isArray(body.taggedEventIds) ? body.taggedEventIds : [];

    if (!title || !content) return NextResponse.json({ error: "Title and suggestion content are required." }, { status: 400 });
    if (title.length > 200 || content.length > 5000) return NextResponse.json({ error: "Suggestion title/content is too long." }, { status: 400 });

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const validIds = (values: unknown[]) => values.every((value) => typeof value === "string" && UUID_RE.test(value));
    if (!validIds(policyIds) || !validIds(eventIds) || policyIds.length + eventIds.length > 10) {
      return NextResponse.json({ error: "You can link up to 10 valid policies/events." }, { status: 400 });
    }
    if (new Set(policyIds).size !== policyIds.length || new Set(eventIds).size !== eventIds.length) {
      return NextResponse.json({ error: "Duplicate linked items are not allowed." }, { status: 400 });
    }

    if (policyIds.length > 0) {
      const { data: policies, error } = await supabase.from("policies").select("id, deleted_at, status").in("id", policyIds as string[]);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      if ((policies ?? []).length !== policyIds.length || (policies ?? []).some((p) => p.deleted_at || p.status === "Archived")) {
        return NextResponse.json({ error: "Archived or deleted policies cannot be tagged." }, { status: 400 });
      }
    }
    if (eventIds.length > 0) {
      const { data: events, error } = await supabase.from("events").select("id, deleted_at").in("id", eventIds as string[]);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      if ((events ?? []).length !== eventIds.length || (events ?? []).some((event) => event.deleted_at)) {
        return NextResponse.json({ error: "Deleted events cannot be tagged." }, { status: 400 });
      }
    }

    const { data, error } = await supabase.from("suggestions").insert({ submitted_by: profile.id, title, content }).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    if (policyIds.length > 0) {
      const { error: tagError } = await supabase.from("suggestion_policy_tags").insert((policyIds as string[]).map((policyId) => ({ suggestion_id: data.id, policy_id: policyId })));
      if (tagError) return NextResponse.json({ error: tagError.message }, { status: 400 });
    }
    if (eventIds.length > 0) {
      const { error: tagError } = await supabase.from("suggestion_event_tags").insert((eventIds as string[]).map((eventId) => ({ suggestion_id: data.id, event_id: eventId })));
      if (tagError) return NextResponse.json({ error: tagError.message }, { status: 400 });
    }

    await recordAudit(supabase, profile.id, "SUBMIT_SUGGESTION", "suggestions", data.id, {
      title,
      taggedPolicyIds: policyIds,
      taggedEventIds: eventIds,
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to submit suggestion.";
    const status = message === "FORBIDDEN" ? 403 : 401;
    return NextResponse.json({ error: status === 403 ? "You do not have permission to submit suggestions." : "Please sign in to continue." }, { status });
  }
}
