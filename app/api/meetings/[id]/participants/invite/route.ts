import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMeetingInvitation } from "@/lib/invitations";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase } = await requireUser(["Super Admin", "Meeting Secretary"]);
    const body = await request.json();
    const participantId = typeof body.participantId === "string" ? body.participantId.trim() : "";
    if (!participantId) return NextResponse.json({ error: "Participant is required." }, { status: 400 });

    const [{ data: meeting, error: meetingError }, { data: participant, error: participantError }, { data: agenda, error: agendaError }] = await Promise.all([
      supabase.from("meetings").select("id,title,date,location,created_by").eq("id", params.id).maybeSingle(),
      supabase.from("participants").select("id,user_id").eq("id", participantId).eq("meeting_id", params.id).maybeSingle(),
      supabase.from("agenda_items").select("topic,sort_order").eq("meeting_id", params.id).order("sort_order"),
    ]);
    if (meetingError || participantError || agendaError) throw meetingError ?? participantError ?? agendaError;
    if (!meeting) return NextResponse.json({ error: "Meeting not found." }, { status: 404 });

    const admin = createAdminClient();
    const { data: participantUser, error: participantUserError } = participant
      ? await admin.from("users").select("id,email,role,department").eq("id", participant.user_id).maybeSingle()
      : { data: null, error: null };
    if (participantUserError) throw participantUserError;
    if (!participantUser) return NextResponse.json({ error: "Participant relation not found." }, { status: 404 });

    const { data: organizer, error: organizerError } = await admin.from("users").select("email").eq("id", meeting.created_by).maybeSingle();
    if (organizerError) throw organizerError;

    await sendMeetingInvitation({
      recipientEmail: participantUser.email,
      recipientName: participantUser.email,
      meetingTitle: meeting.title,
      meetingId: meeting.id,
      date: new Intl.DateTimeFormat("en-IN", { dateStyle: "full", timeStyle: "short" }).format(new Date(meeting.date)),
      organizer: organizer?.email ?? "Institutional Governance",
      location: meeting.location,
      agenda: (agenda ?? []).map(item => `${item.sort_order + 1}. ${item.topic}`),
    });
    return NextResponse.json({ data: { sent: true } });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (error instanceof Error && error.message === "FORBIDDEN") return NextResponse.json({ error: "You do not have permission to send invitations." }, { status: 403 });
    if (error instanceof Error && error.message.includes("Email invitations are not configured")) return NextResponse.json({ error: error.message }, { status: 503 });
    return NextResponse.json({ error: "Unable to send meeting invitation." }, { status: 500 });
  }
}
