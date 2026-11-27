import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  message: string;
  href: string | null;
  target_table: string | null;
  target_id: string | null;
  read_at: string | null;
  created_at: string;
};

function getNotificationHref(row: NotificationRow) {
  if (row.target_table && row.target_id) {
    switch (row.target_table) {
      case "meetings":
        return `/meetings/${row.target_id}/join`;
      case "policies":
        return `/policies/${row.target_id}`;
      case "action_items":
        return `/my-workspace?taskId=${row.target_id}`;
      case "events":
        return `/events/${row.target_id}`;
    }
  }

  // Older notification producers may store a direct in-app destination.
  // Only allow local paths; never turn database content into an external redirect.
  return row.href?.startsWith("/") && !row.href.startsWith("//") ? row.href : null;
}

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    const [{ data, error }, { count, error: countError }] = await Promise.all([
      supabase
        .from("notifications")
        .select("id,type,title,message,href,target_table,target_id,read_at,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .is("read_at", null),
    ]);

    if (error) throw error;
    if (countError) throw countError;

    const notifications = ((data ?? []) as NotificationRow[]).map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      message: row.message,
      href: getNotificationHref(row),
      read_at: row.read_at,
      created_at: row.created_at,
    }));

    return NextResponse.json({ data: notifications, unread_count: count ?? 0 }, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (error instanceof Error && error.message === "PROFILE_NOT_FOUND") return NextResponse.json({ error: "User profile not found." }, { status: 403 });
    console.error("GET /api/notifications failed:", error);
    return NextResponse.json({ error: "Unable to load notifications." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, user } = await requireUser();
    let body: { id?: unknown; action?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "A valid JSON body is required." }, { status: 400 });
    }

    const readAt = new Date().toISOString();
    if (body.action === "mark_all_read") {
      const { data, error } = await supabase
        .from("notifications")
        .update({ read_at: readAt })
        .eq("user_id", user.id)
        .is("read_at", null)
        .select("id,read_at");
      if (error) throw error;
      return NextResponse.json({ data: data ?? [] });
    }

    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "Notification id is required." }, { status: 400 });

    const { data, error } = await supabase
      .from("notifications")
      .update({ read_at: readAt })
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id,read_at")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Notification not found." }, { status: 404 });
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (error instanceof Error && error.message === "PROFILE_NOT_FOUND") return NextResponse.json({ error: "User profile not found." }, { status: 403 });
    console.error("PATCH /api/notifications failed:", error);
    return NextResponse.json({ error: "Unable to update notification." }, { status: 500 });
  }
}
