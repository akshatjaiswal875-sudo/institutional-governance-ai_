import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth";
import { sendMeetingInvitation } from "@/lib/invitations";

const MEETING_MANAGERS = ["Director", "Principal", "HOD", "Coordinator", "Coordinators", "Super Admin", "Meeting Secretary"] as const;

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase } = await requireUser([...MEETING_MANAGERS]);
    const body = await request.json();
    const participantId = typeof body.participantId === "string" ? body.participantId.trim() : "";
    if (!participantId) return NextResponse.json({ error: "Participant is required." }, { status: 400 });

    const [{ data: meeting, error: meetingError }, { data: participant, error: participantError }, { data: agenda, error: agendaError }] = await Promise.all([
      supabase.from("meetings").select("id,title,date,location,type,conference_url,created_by").eq("id", params.id).maybeSingle(),
      supabase.from("participants").select("id,user_id").eq("id", participantId).eq("meeting_id", params.id).maybeSingle(),
      supabase.from("agenda_items").select("topic,sort_order").eq("meeting_id", params.id).order("sort_order"),
    ]);
    if (meetingError || participantError || agendaError) throw meetingError ?? participantError ?? agendaError;
    if (!meeting) return NextResponse.json({ error: "Meeting not found." }, { status: 404 });

    const admin = createAdminClient();
    const { data: participantUser, error: participantUserError } = participant ? await admin.from("users").select("id,email,role,department").eq("id", participant.user_id).maybeSingle() : { data: null, error: null };
    if (participantUserError) throw participantUserError;
    if (!participantUser) return NextResponse.json({ error: "Participant relation not found." }, { status: 404 });
    const { data: organizer, error: organizerError } = await admin.from("users").select("email").eq("id", meeting.created_by).maybeSingle();
    if (organizerError) throw organizerError;

    if (meeting.type === "online" && !meeting.conference_url) {
      meeting.conference_url = `https://meet.jit.si/InstitutionalGovernance-${meeting.id}`;
      const { error: linkError } = await admin.from("meetings").update({ conference_url: meeting.conference_url }).eq("id", meeting.id);
      if (linkError) throw linkError;
    }

    await sendMeetingInvitation({
      recipientEmail: participantUser.email,
      recipientName: participantUser.email,
      meetingTitle: meeting.title,
      meetingId: meeting.id,
      conferenceUrl: meeting.type === "online" ? meeting.conference_url : null,
      date: new Intl.DateTimeFormat("en-IN", { dateStyle: "full", timeStyle: "short" }).format(new Date(meeting.date)),
      organizer: organizer?.email ?? "Institutional Governance",
      location: meeting.location,
      agenda: (agenda ?? []).map(item => `${item.sort_order + 1}. ${item.topic}`),
    });

    await admin.from("notifications").insert({
      user_id: participantUser.id,
      type: "meeting",
      title: meeting.type === "online" ? "Online meeting invitation" : "Meeting invitation",
      message: meeting.type === "online" ? `${meeting.title} is ready. Tap to join the online meeting.` : `You have been invited to ${meeting.title}.`,
      target_table: "meetings",
      target_id: meeting.id,
    });

    return NextResponse.json({ data: { sent: true, conferenceUrl: meeting.conference_url ?? null } });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (error instanceof Error && error.message === "FORBIDDEN") return NextResponse.json({ error: "You do not have permission to send invitations." }, { status: 403 });
    if (error instanceof Error && error.message.includes("Email invitations are not configured")) return NextResponse.json({ error: error.message }, { status: 503 });
    return NextResponse.json({ error: "Unable to send meeting invitation." }, { status: 500 });
  }
}
