import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/lib/audit";
import { sendMeetingInvitation } from "@/lib/invitations";

function clean(value: unknown) { return typeof value === "string" ? value.trim() : ""; }

function parseMeetingRequest(message: string) {
  const lower = message.toLowerCase();
  const date = lower.includes("tomorrow") ? new Date(Date.now() + 86400000) : lower.includes("today") ? new Date() : null;
  const timeMatch = message.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i) ?? message.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  let dateTime: string | null = null;
  if (date && timeMatch) {
    let hour = Number(timeMatch[1]); const minute = Number(timeMatch[2] ?? 0); const meridiem = timeMatch[3]?.toLowerCase();
    if (meridiem === "pm" && hour < 12) hour += 12; if (meridiem === "am" && hour === 12) hour = 0;
    const ist = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Kolkata" })); ist.setHours(hour, minute, 0, 0);
    dateTime = `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, "0")}-${String(ist.getDate()).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+05:30`;
  }
  const withMatch = message.match(/\bwith\s+(.+?)(?=\s+(?:tomorrow|today|on|at|in|to discuss|about|regarding)\b|[,.]|$)/i);
  const topicMatch = message.match(/\b(?:to discuss|about|regarding)\s+(.+?)(?:[,.]|$)/i);
  const locationMatch = message.match(/\b(?:at|in)\s+([^,.]+?)(?=\s+(?:tomorrow|today|to discuss|about|regarding|at)\b|[,.]|$)/i);
  const participantQuery = clean(withMatch?.[1]); const topic = clean(topicMatch?.[1]);
  return { title: topic ? `${topic} Meeting` : participantQuery ? `Meeting with ${participantQuery}` : "New Meeting", date: dateTime, location: clean(locationMatch?.[1]) || null, participantQuery, topic };
}

function ilikePattern(value: string) { return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`; }

export async function POST(request: Request) {
  try {
    const { supabase, user, profile } = await requireUser(["Super Admin"]);
    const admin = createAdminClient(); const body = await request.json(); const action = clean(body?.action);

    if (action === "prepare") {
      const message = clean(body?.message); if (!message) return NextResponse.json({ error: "Describe the meeting first." }, { status: 400 });
      const draft = parseMeetingRequest(message); const needs: string[] = [];
      if (!draft.date) needs.push("date and time"); if (!draft.participantQuery) needs.push("participants");
      let participants: any[] = [];
      if (draft.participantQuery) {
        const q = draft.participantQuery; const pattern = ilikePattern(q);
        // public.users intentionally exposes only the caller's own row through
        // normal RLS. This endpoint is Super Admin-only, so use the service
        // role for participant discovery. role is a Postgres enum, therefore
        // use exact equality instead of ILIKE, which PostgreSQL rejects for enums.
        const [emailResult, roleResult, departmentResult] = await Promise.all([
          admin.from("users").select("id,email,role,department").ilike("email", pattern).limit(30),
          admin.from("users").select("id,email,role,department").eq("role", q).limit(30),
          admin.from("users").select("id,email,role,department").ilike("department", pattern).limit(30),
        ]);
        const error = emailResult.error ?? roleResult.error ?? departmentResult.error; if (error) throw error;
        const byId = new Map<string, any>();
        for (const row of [...(emailResult.data ?? []), ...(roleResult.data ?? []), ...(departmentResult.data ?? [])]) byId.set(row.id, row);
        participants = [...byId.values()].slice(0, 30);
      }
      if (draft.participantQuery && !participants.length) needs.push("a valid participant selection");
      return NextResponse.json({ data: { draft, participants, needs } });
    }

    if (action === "confirm") {
      const draft = body?.draft; const participantIds = Array.isArray(body?.participantIds) ? body.participantIds.filter((id: unknown): id is string => typeof id === "string") : [];
      const title = clean(draft?.title); const date = clean(draft?.date); const location = clean(draft?.location) || null;
      if (!title || !date) return NextResponse.json({ error: "Meeting title and date/time are required." }, { status: 400 });
      if (!participantIds.length) return NextResponse.json({ error: "Select at least one participant." }, { status: 400 });

      const { data: validUsers, error: usersError } = await admin.from("users").select("id,email,role,department").in("id", participantIds);
      if (usersError) throw usersError; if (!validUsers?.length) return NextResponse.json({ error: "No valid participants were selected." }, { status: 400 });

      const { data: meeting, error: meetingError } = await supabase.from("meetings").insert({ title, date, location, type: draft?.type === "online" ? "online" : "offline", created_by: user.id, status: "Draft" }).select("id,title,date,location,created_by,status").single();
      if (meetingError) throw meetingError;
      const { data: insertedParticipants, error: participantError } = await admin.from("participants").insert(validUsers.map((u) => ({ meeting_id: meeting.id, user_id: u.id, attendance_status: "Invited" }))).select("id,user_id");
      if (participantError) throw participantError;
      const { data: agenda, error: agendaError } = await supabase.from("agenda_items").select("topic,sort_order").eq("meeting_id", meeting.id).order("sort_order");
      if (agendaError) throw agendaError;
      await recordAudit(supabase, profile.id, "CREATE_MEETING", "meetings", meeting.id, { title, status: "Draft", source: "AI Assistant" });
      const { data: organizer } = await admin.from("users").select("email").eq("id", user.id).maybeSingle(); const invitationErrors: string[] = [];
      for (const participant of insertedParticipants ?? []) {
        const recipient = validUsers.find((u) => u.id === participant.user_id); if (!recipient) continue;
        try { await sendMeetingInvitation({ recipientEmail: recipient.email, recipientName: recipient.email, meetingTitle: meeting.title, meetingId: meeting.id, date: new Intl.DateTimeFormat("en-IN", { dateStyle: "full", timeStyle: "short" }).format(new Date(meeting.date)), organizer: organizer?.email ?? "Institutional Governance", location: meeting.location, agenda: (agenda ?? []).map((item) => `${item.sort_order + 1}. ${item.topic}`) }); }
        catch (error) { invitationErrors.push(`${recipient.email}: ${error instanceof Error ? error.message : "Invitation failed"}`); }
      }
      return NextResponse.json({ data: { meeting, participants: validUsers, invitationErrors } }, { status: 201 });
    }
    return NextResponse.json({ error: "Unsupported meeting action." }, { status: 400 });
  } catch (error) {
    console.error("[assistant/meeting-action]", error);
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (error instanceof Error && error.message === "FORBIDDEN") return NextResponse.json({ error: "Only Super Admin can create meetings through the AI Assistant." }, { status: 403 });
    if (error instanceof Error && error.message === "PROFILE_NOT_FOUND") return NextResponse.json({ error: "Your login is missing a public.users profile. Ask a Super Admin to create/link your profile." }, { status: 403 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to process meeting action." }, { status: 500 });
  }
}
