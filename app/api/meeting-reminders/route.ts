import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMeetingReminder } from "@/lib/meeting-reminders";

const WINDOWS = [
  { type: "24h" as const, offsetMinutes: 1440 },
  { type: "1h" as const, offsetMinutes: 60 },
  { type: "15m" as const, offsetMinutes: 15 },
];
const TOLERANCE_MINUTES = 8;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const admin = createAdminClient();
    const now = new Date();
    const results: Array<{ meetingId: string; reminderType: string; sent: number; skipped: number }> = [];

    for (const window of WINDOWS) {
      const target = new Date(now.getTime() + window.offsetMinutes * 60_000);
      const from = new Date(target.getTime() - TOLERANCE_MINUTES * 60_000).toISOString();
      const to = new Date(target.getTime() + TOLERANCE_MINUTES * 60_000).toISOString();
      const { data: meetings, error: meetingError } = await admin
        .from("meetings")
        .select("id,title,date,location,type,conference_url,created_by,status")
        .gte("date", from)
        .lte("date", to)
        .not("status", "in", "(Cancelled,Completed)");
      if (meetingError) throw meetingError;

      for (const meeting of meetings ?? []) {
        const [{ data: participants, error: participantsError }, { data: organizer, error: organizerError }] = await Promise.all([
          admin.from("participants").select("user_id").eq("meeting_id", meeting.id),
          admin.from("users").select("email").eq("id", meeting.created_by).maybeSingle(),
        ]);
        if (participantsError || organizerError) throw participantsError ?? organizerError;

        const ids = [...new Set((participants ?? []).map((item) => item.user_id).filter(Boolean))];
        if (!ids.length) continue;
        const { data: users, error: usersError } = await admin.from("users").select("id,email").in("id", ids);
        if (usersError) throw usersError;

        let sent = 0;
        let skipped = 0;
        for (const recipient of users ?? []) {
          const { data: claim, error: claimError } = await admin
            .from("meeting_reminder_log")
            .insert({ meeting_id: meeting.id, user_id: recipient.id, reminder_type: window.type })
            .select("id")
            .maybeSingle();
          if (claimError?.code === "23505") { skipped += 1; continue; }
          if (claimError) throw claimError;
          if (!claim) { skipped += 1; continue; }

          try {
            await sendMeetingReminder({
              recipientEmail: recipient.email,
              recipientName: recipient.email,
              meetingTitle: meeting.title,
              meetingDate: new Intl.DateTimeFormat("en-IN", { dateStyle: "full", timeStyle: "short" }).format(new Date(meeting.date)),
              organizer: organizer?.email ?? "Institutional Governance",
              location: meeting.location,
              meetingId: meeting.id,
              conferenceUrl: meeting.type === "online" ? meeting.conference_url : null,
              reminderType: window.type,
            });
            await admin.from("notifications").insert({
              user_id: recipient.id,
              type: "meeting",
              title: `${window.type === "24h" ? "24-hour" : window.type === "1h" ? "1-hour" : "15-minute"} meeting reminder`,
              message: `${meeting.title} starts at ${new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(meeting.date))}.`,
              target_table: "meetings",
              target_id: meeting.id,
            });
            sent += 1;
          } catch (error) {
            await admin.from("meeting_reminder_log").delete().eq("id", claim.id);
            console.error(`Reminder failed for ${meeting.id}/${recipient.id}:`, error);
          }
        }
        results.push({ meetingId: meeting.id, reminderType: window.type, sent, skipped });
      }
    }

    return NextResponse.json({ data: { processedAt: now.toISOString(), results } });
  } catch (error) {
    console.error("GET /api/meeting-reminders failed:", error);
    return NextResponse.json({ error: "Unable to process meeting reminders." }, { status: 500 });
  }
}
