import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/lib/audit";
import { sendMeetingInvitation } from "@/lib/invitations";

const MEETING_CREATORS = ["Director", "Principal", "HOD", "Coordinators", "Coordinator", "Super Admin", "Meeting Secretary"] as const;

export async function GET() {
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.from("meetings").select("*").order("date", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    const status = error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ error: "Unable to load meetings." }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user, profile } = await requireUser([...MEETING_CREATORS]);
    const body = await request.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const date = typeof body.date === "string" ? body.date : "";
    const location = typeof body.location === "string" && body.location.trim() ? body.location.trim() : null;
    const type = body.type === "online" ? "online" : "offline";
    if (!title || !date) return NextResponse.json({ error: "Meeting title and date are required." }, { status: 400 });

    const { data, error } = await supabase
      .from("meetings")
      .insert({ title, date, location: type === "online" ? "Online" : location, type, created_by: user.id, status: "Draft" as const })
      .select("id,title,date,location,type,status,created_by,conference_url")
      .single();
    if (error) return NextResponse.json({ error: error.message, details: error.details, hint: error.hint, code: error.code }, { status: 403 });

    let conferenceUrl: string | null = null;
    if (type === "online") {
      conferenceUrl = `https://meet.jit.si/InstitutionalGovernance-${data.id}`;
      const { error: linkError } = await supabase.from("meetings").update({ conference_url: conferenceUrl }).eq("id", data.id);
      if (linkError) throw linkError;
      data.conference_url = conferenceUrl;
    }

    const admin = createAdminClient();
    const [{ data: users, error: usersError }, { data: agenda }] = await Promise.all([
      admin.from("users").select("id,email").not("email", "is", null),
      admin.from("agenda_items").select("topic,sort_order").eq("meeting_id", data.id).order("sort_order"),
    ]);
    if (usersError) throw usersError;

    if (users?.length) {
      const notificationRows = users.map((recipient) => ({
        user_id: recipient.id,
        type: "meeting",
        title: type === "online" ? "New online meeting" : "New meeting",
        message: type === "online" ? `${title} is scheduled for ${new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(date))}. Tap to join online.` : `${title} is scheduled for ${new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(date))}.`,
        target_table: "meetings",
        target_id: data.id,
      }));
      const { error: notificationError } = await admin.from("notifications").insert(notificationRows);
      if (notificationError) console.error("Meeting notifications could not be created:", notificationError);

      if (type === "online" && conferenceUrl) {
        const organizer = user.email ?? "Institutional Governance";
        await Promise.allSettled(
          users.map((recipient) =>
            sendMeetingInvitation({
              recipientEmail: recipient.email,
              recipientName: recipient.email,
              meetingTitle: title,
              meetingId: data.id,
              conferenceUrl,
              date: new Intl.DateTimeFormat("en-IN", { dateStyle: "full", timeStyle: "short" }).format(new Date(date)),
              organizer,
              location: "Online",
              agenda: (agenda ?? []).map((item) => `${item.sort_order + 1}. ${item.topic}`),
            }),
          ),
        );
      }
    }

    await recordAudit(supabase, profile.id, "CREATE_MEETING", "meetings", data.id, {
      title,
      status: "Draft",
      creator_role: profile.role,
      type,
      conference_url: conferenceUrl,
      notifications_sent: users?.length ?? 0,
    });

    return NextResponse.json({ data: { ...data, conference_url: conferenceUrl } });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (error instanceof Error && error.message === "FORBIDDEN") return NextResponse.json({ error: "You do not have permission to create meetings." }, { status: 403 });
    console.error("POST /api/meetings failed:", error);
    return NextResponse.json({ error: "Unable to create meeting." }, { status: 500 });
  }
}
