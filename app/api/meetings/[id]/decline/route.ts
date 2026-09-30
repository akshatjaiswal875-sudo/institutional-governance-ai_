import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { sendMeetingDeclineNotification } from "@/lib/invitations";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase, profile } = await requireUser();
    const body = await request.json();
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    if (reason.length < 5) {
      return NextResponse.json({ error: "Please provide a reason of at least 5 characters." }, { status: 400 });
    }
    if (reason.length > 1000) {
      return NextResponse.json({ error: "Reason must be 1000 characters or fewer." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: meeting, error: meetingError } = await admin
      .from("meetings")
      .select("id,title,date,created_by,users!meetings_created_by_fkey(email)")
      .eq("id", params.id)
      .maybeSingle();
    if (meetingError) throw meetingError;
    if (!meeting) return NextResponse.json({ error: "Meeting not found." }, { status: 404 });

    const organizer = Array.isArray(meeting.users) ? meeting.users[0] : meeting.users;
    if (!organizer?.email) {
      return NextResponse.json({ error: "The meeting organizer email could not be found." }, { status: 500 });
    }

    const { data: participant, error: participantError } = await supabase
      .from("participants")
      .select("id,attendance_status")
      .eq("meeting_id", params.id)
      .eq("user_id", profile.id)
      .maybeSingle();
    if (participantError) throw participantError;
    if (!participant) return NextResponse.json({ error: "You are not an invited participant for this meeting." }, { status: 403 });
    if (participant.attendance_status === "Declined") {
      return NextResponse.json({ error: "You have already declined this meeting." }, { status: 409 });
    }

    const { error: updateError } = await supabase
      .from("participants")
      .update({ attendance_status: "Declined" })
      .eq("id", participant.id)
      .eq("user_id", profile.id);
    if (updateError) throw updateError;

    try {
      await sendMeetingDeclineNotification({
        organizerEmail: organizer.email,
        participantName: profile.email,
        participantEmail: profile.email,
        meetingTitle: meeting.title,
        meetingId: meeting.id,
        date: new Intl.DateTimeFormat("en-IN", { dateStyle: "full", timeStyle: "short" }).format(new Date(meeting.date)),
        reason,
      });
    } catch (emailError) {
      await supabase.from("participants").update({ attendance_status: participant.attendance_status }).eq("id", participant.id).eq("user_id", profile.id);
      throw emailError;
    }

    await recordAudit(supabase, profile.id, "DECLINE_MEETING", "participants", participant.id, {
      meeting_id: params.id,
      user_id: profile.id,
      attendance_status: "Declined",
      reason,
    });

    return NextResponse.json({ data: { success: true, message: "Meeting declined. Your reason was emailed to the organizer." } });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const message = error instanceof Error ? error.message : "Unable to decline meeting.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
