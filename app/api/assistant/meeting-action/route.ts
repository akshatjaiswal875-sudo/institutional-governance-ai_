import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/lib/audit";
import { sendMeetingInvitation } from "@/lib/invitations";

function clean(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function parseMeetingRequest(message: string) {
  const lower = message.toLowerCase();
  const nextWeek = /\bnext\s+week\b/.test(lower);
  const today = /\btoday\b/.test(lower);
  const tomorrow = /\btomorrow\b/.test(lower);
  const dateMatch = message.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  const timeMatch = message.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i) ?? message.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  let dateTime: string | null = null;
  if ((today || tomorrow || dateMatch) && timeMatch) {
    const base = dateMatch ? new Date(`${dateMatch[1]}T12:00:00+05:30`) : new Date();
    if (tomorrow) base.setDate(base.getDate() + 1);
    let hour = Number(timeMatch[1]); const minute = Number(timeMatch[2] ?? 0); const meridiem = timeMatch[3]?.toLowerCase();
    if (meridiem === "pm" && hour < 12) hour += 12; if (meridiem === "am" && hour === 12) hour = 0;
    const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(base);
    dateTime = `${localDate}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+05:30`;
  }
  const withMatch = message.match(/\bwith\s+(.+?)(?=\s+(?:for|to discuss|about|regarding|tomorrow|today|next week|on|at|in)\b|[,.]|$)/i);
  const topicMatch = message.match(/\b(?:for|to discuss|about|regarding)\s+(.+?)(?=\s+(?:tomorrow|today|next week|on|at)\b|[,.]|$)/i);
  const locationMatch = message.match(/\bat\s+([^,.]+?)(?=\s+(?:tomorrow|today|next week|to discuss|about|regarding)\b|[,.]|$)/i);
  let participantQuery = clean(withMatch?.[1]).replace(/^(?:the|all)\s+/i, "");
  const aliases: Record<string, string> = { hod: "HOD", hods: "HOD", "head of department": "HOD", "heads of departments": "HOD", faculty: "Faculty / Officer", faculties: "Faculty / Officer", "meeting secretary": "Meeting Secretary", coordinator: "Coordinators", coordinators: "Coordinators", members: "Member" };
  participantQuery = aliases[participantQuery.toLowerCase()] ?? participantQuery;
  const topic = clean(topicMatch?.[1]);
  return {
    title: topic ? `${topic} Meeting` : participantQuery ? `Meeting with ${participantQuery}` : "New Meeting",
    date: dateTime, location: clean(locationMatch?.[1]) || null, participantQuery, topic,
    windowHint: nextWeek ? "next_week" : "next_7_days",
  };
}

export async function POST(request: Request) {
  try {
    const { supabase, user, profile } = await requireUser();
    const admin = createAdminClient(); const body = await request.json(); const action = clean(body?.action);

    if (action === "prepare") {
      const message = clean(body?.message); if (!message) return NextResponse.json({ error: "Describe the meeting first." }, { status: 400 });
      const draft = parseMeetingRequest(message); const needs: string[] = [];
      if (!draft.participantQuery) needs.push("participants");
      let participants: any[] = [];
      let usedFallback = false;
      if (draft.participantQuery) {
        const q = draft.participantQuery.trim();
        const roleAliases: Record<string, string> = {
          hod: "HOD", hods: "HOD", "head of department": "HOD", "heads of departments": "HOD",
          faculty: "Faculty / Officer", faculties: "Faculty / Officer",
          director: "Director", principal: "Principal", "super admin": "Super Admin",
          "meeting secretary": "Meeting Secretary", coordinator: "Coordinators", coordinators: "Coordinators",
        };
        const roleAndDepartment = q.match(/^(hods?|heads? of department|facult(?:y|ies))(?:\\s+(?:of|from|in)\\s+(.+))?$/i);
        const requestedRole = roleAliases[q.toLowerCase()] ?? (roleAndDepartment ? roleAliases[roleAndDepartment[1].toLowerCase()] : null);
        const requestedDepartment = roleAndDepartment?.[2]?.trim() ?? "";
        if (requestedRole) {
          let query = admin.from("users").select("id,email,role,department").eq("role", requestedRole).order("email").limit(50);
          if (requestedDepartment) query = query.ilike("department", requestedDepartment);
          const { data, error } = await query;
          if (error) throw error;
          participants = data ?? [];
        } else if (q.includes("@")) {
          const { data, error } = await admin.from("users").select("id,email,role,department").ilike("email", q).limit(1);
          if (error) throw error;
          participants = data ?? [];
        } else {
          // A department name resolves only to its HOD and faculty, never to
          // every account registered in the institution.
          const { data, error } = await admin.from("users").select("id,email,role,department").ilike("department", q).in("role", ["HOD", "Faculty / Officer"]).order("email").limit(50);
          if (error) throw error;
          participants = data ?? [];
        }
      }
      if (draft.participantQuery && !participants.length) needs.push("a valid participant selection");
      return NextResponse.json({ data: { draft, participants, needs, usedFallback } });
    }

    if (action === "confirm") {
      const draft = body?.draft; const participantIds = Array.isArray(body?.participantIds) ? body.participantIds.filter((id: unknown): id is string => typeof id === "string") : [];
      const title = clean(draft?.title); const date = clean(draft?.date); const location = clean(draft?.location) || null;
      if (!title || !date) return NextResponse.json({ error: "Meeting title and date/time are required." }, { status: 400 });
      if (!participantIds.length) return NextResponse.json({ error: "Select at least one participant." }, { status: 400 });

      const { data: validUsers, error: usersError } = await admin.from("users").select("id,email,role,department").in("id", participantIds).in("role", ["HOD", "Faculty / Officer", "Director", "Principal", "Super Admin", "Meeting Secretary", "Coordinators", "Coordinator"]);
      if (usersError) throw usersError; if (!validUsers?.length) return NextResponse.json({ error: "No valid participants were selected." }, { status: 400 });

      const { data: meeting, error: meetingError } = await supabase.from("meetings").insert({ title, date, location, type: draft?.type === "online" ? "online" : "offline", created_by: user.id, status: "Draft" }).select("id,title,date,location,created_by,status").single();
      if (meetingError) throw meetingError;
      const { data: insertedParticipants, error: participantError } = await admin.from("participants").insert(validUsers.map((u) => ({ meeting_id: meeting.id, user_id: u.id, attendance_status: "Invited" }))).select("id,user_id");
      if (participantError) {
        await admin.from("meetings").delete().eq("id", meeting.id);
        throw participantError;
      }
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
    if (error instanceof Error && error.message === "FORBIDDEN") return NextResponse.json({ error: "Only the meeting creator can manage this meeting." }, { status: 403 });
    if (error instanceof Error && error.message === "PROFILE_NOT_FOUND") return NextResponse.json({ error: "Your login is missing a public.users profile. Ask a Super Admin to create/link your profile." }, { status: 403 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to process meeting action." }, { status: 500 });
  }
}
