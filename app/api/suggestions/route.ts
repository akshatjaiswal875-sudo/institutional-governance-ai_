import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

const REVIEWERS = ["Director", "Principal", "HOD", "Coordinator"] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type TagInput = { id: string; type: "policy" | "event" };

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function parseTags(value: unknown): TagInput[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  if (value.length > 10) return null;

  const seen = new Set<string>();
  const tags: TagInput[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const candidate = item as Record<string, unknown>;
    const id = candidate.id;
    const type = candidate.type;
    if (!isUuid(id) || (type !== "policy" && type !== "event")) return null;
    const key = `${type}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push({ id, type });
  }
  return tags;
}

export async function GET() {
  try {
    const { supabase } = await requireUser([...REVIEWERS]);
    const { data, error } = await supabase
      .from("suggestions")
      .select(`
        *,
        policy_tags:suggestion_policy_tags(
          policy_id,
          policies:policy_id(id, custom_id, title, status, deleted_at)
        ),
        event_tags:suggestion_event_tags(
          event_id,
          events:event_id(id, custom_id, title, deleted_at)
        )
      `)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (data ?? []).map((item) => {
      const raw = item as Record<string, unknown>;
      const policyTags = Array.isArray(raw.policy_tags)
        ? raw.policy_tags.flatMap((entry) => {
            const row = entry as { policies?: { id: string; custom_id: string; title: string; status?: string | null; deleted_at?: string | null } | null };
            const policy = row.policies;
            return policy && !policy.deleted_at ? [{ id: policy.id, type: "policy" as const, customId: policy.custom_id, title: policy.title, archived: policy.status === "ARCHIVED" }] : [];
          })
        : [];
      const eventTags = Array.isArray(raw.event_tags)
        ? raw.event_tags.flatMap((entry) => {
            const row = entry as { events?: { id: string; custom_id: string; title: string; deleted_at?: string | null } | null };
            const event = row.events;
            return event && !event.deleted_at ? [{ id: event.id, type: "event" as const, customId: event.custom_id, title: event.title }] : [];
          })
        : [];
      return { ...raw, policy_tags: policyTags, event_tags: eventTags };
    });

    return NextResponse.json({ data: rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load suggestions.";
    return NextResponse.json({ error: message }, { status: message === "FORBIDDEN" ? 403 : 401 });
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, profile } = await requireUser();
    const body = (await request.json()) as Record<string, unknown>;
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const content = typeof body.content === "string" ? body.content.trim() : "";
    const policyIds = Array.isArray(body.taggedPolicyIds) ? body.taggedPolicyIds : [];
    const eventIds = Array.isArray(body.taggedEventIds) ? body.taggedEventIds : [];

    if (!title || !content) return NextResponse.json({ error: "Title and suggestion content are required." }, { status: 400 });
    if (title.length > 200 || content.length > 5000) return NextResponse.json({ error: "Suggestion title/content is too long." }, { status: 400 });

    const tags = parseTags([
      ...policyIds.map((id) => ({ id, type: "policy" })),
      ...eventIds.map((id) => ({ id, type: "event" })),
    ]);
    if (!tags || tags.length > 10) return NextResponse.json({ error: "You can link up to 10 valid policies/events." }, { status: 400 });

    const policyTagIds = tags.filter((tag) => tag.type === "policy").map((tag) => tag.id);
    const eventTagIds = tags.filter((tag) => tag.type === "event").map((tag) => tag.id);

    if (policyTagIds.length > 0) {
      const { data: policies, error } = await supabase.from("policies").select("id, deleted_at, status").in("id", policyTagIds);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      if ((policies ?? []).length !== policyTagIds.length || (policies ?? []).some((p) => p.deleted_at || p.status === "ARCHIVED")) {
        return NextResponse.json({ error: "Archived or deleted policies cannot be tagged." }, { status: 400 });
      }
    }

    if (eventTagIds.length > 0) {
      const { data: events, error } = await supabase.from("events").select("id, deleted_at").in("id", eventTagIds);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      if ((events ?? []).length !== eventTagIds.length || (events ?? []).some((event) => event.deleted_at)) {
        return NextResponse.json({ error: "Deleted events cannot be tagged." }, { status: 400 });
      }
    }

    const { data, error } = await supabase.from("suggestions").insert({ submitted_by: profile.id, title, content }).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    if (policyTagIds.length > 0) {
      const { error: tagError } = await supabase.from("suggestion_policy_tags").insert(policyTagIds.map((policyId) => ({ suggestion_id: data.id, policy_id: policyId })));
      if (tagError) return NextResponse.json({ error: tagError.message }, { status: 400 });
    }
    if (eventTagIds.length > 0) {
      const { error: tagError } = await supabase.from("suggestion_event_tags").insert(eventTagIds.map((eventId) => ({ suggestion_id: data.id, event_id: eventId })));
      if (tagError) return NextResponse.json({ error: tagError.message }, { status: 400 });
    }

    await recordAudit(supabase, profile.id, "SUBMIT_SUGGESTION", "suggestions", data.id, {
      title,
      taggedPolicyIds: policyTagIds,
      taggedEventIds: eventTagIds,
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to submit suggestion.";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
