import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

const MEETING_CREATORS = ["Director", "Principal", "HOD", "Coordinators", "Coordinator", "Super Admin", "Meeting Secretary"] as const;

export async function GET() {
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase
      .from("meetings")
      .select("*")
      .order("date", { ascending: false });
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
    const body: unknown = await request.json();
    const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const title = typeof input.title === "string" ? input.title.trim() : "";
    const date = typeof input.date === "string" ? input.date : "";
    const location = typeof input.location === "string" && input.location.trim() ? input.location.trim() : null;
    const type = input.type === "online" ? "online" : "offline";
    const suppliedConferenceUrl = typeof input.conference_url === "string" ? input.conference_url.trim() : "";

    if (!title || !date) {
      return NextResponse.json({ error: "Meeting title and date are required." }, { status: 400 });
    }

    let conferenceUrl: string | null = null;
    if (type === "online" && suppliedConferenceUrl) {
      try {
        const parsed = new URL(suppliedConferenceUrl);
        if (!/^https?:$/.test(parsed.protocol)) throw new Error("Invalid protocol");
        conferenceUrl = parsed.toString();
      } catch {
        return NextResponse.json(
          { error: "Please enter a valid online meeting URL starting with https:// or http://." },
          { status: 400 },
        );
      }
    }

    const { data, error } = await supabase
      .from("meetings")
      .insert({
        title,
        date,
        location: type === "online" ? "Online" : location,
        type,
        created_by: user.id,
        status: "Draft" as const,
      })
      .select("id,title,date,location,type,status,created_by,conference_url")
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message, details: error.details, hint: error.hint, code: error.code },
        { status: 403 },
      );
    }

    if (type === "online" && !conferenceUrl) {
      conferenceUrl = `https://meet.jit.si/InstitutionalGovernance-${data.id}`;
      const { error: linkError } = await supabase
        .from("meetings")
        .update({ conference_url: conferenceUrl })
        .eq("id", data.id);
      if (linkError) throw linkError;
      data.conference_url = conferenceUrl;
    }

    // Draft creation must stay fast. Notifications and email invitations are
    // intentionally deferred until participants are selected and the meeting
    // is submitted/published. The previous implementation loaded every user,
    // created notifications for every user, and sent an email to every user
    // during a simple "Save draft" operation.
    await recordAudit(supabase, profile.id, "CREATE_MEETING", "meetings", data.id, {
      title,
      status: "Draft",
      creator_role: profile.role,
      type,
      conference_url: conferenceUrl,
      custom_conference_url: Boolean(suppliedConferenceUrl),
    });

    return NextResponse.json({ data: { ...data, conference_url: conferenceUrl } });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "You do not have permission to create meetings." }, { status: 403 });
    }
    console.error("POST /api/meetings failed:", error);
    return NextResponse.json({ error: "Unable to create meeting." }, { status: 500 });
  }
}
