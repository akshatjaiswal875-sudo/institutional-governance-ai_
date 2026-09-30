import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  message: string;
  target_table: string | null;
  target_id: string | null;
  read_at: string | null;
  created_at: string;
};

function getNotificationHref(row: NotificationRow) {
  if (!row.target_table || !row.target_id) return null;

  switch (row.target_table) {
    case "meetings":
      return `/meetings/${row.target_id}`;
    case "policies":
      return `/policies/${row.target_id}`;
    case "action_items":
      return `/action-items/${row.target_id}`;
    case "events":
      return `/events/${row.target_id}`;
    default:
      return null;
  }
}

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    const { data, error } = await supabase
      .from("notifications")
      .select("id,type,title,message,target_table,target_id,read_at,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    const notifications = ((data ?? []) as NotificationRow[]).map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      message: row.message,
      href: getNotificationHref(row),
      read_at: row.read_at,
      created_at: row.created_at,
    }));

    return NextResponse.json({ data: notifications });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    console.error("GET /api/notifications failed:", error);
    return NextResponse.json({ error: "Unable to load notifications." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, user } = await requireUser();
    const body = await request.json();
    const id = typeof body.id === "string" ? body.id : "";

    if (!id) {
      return NextResponse.json({ error: "Notification id is required." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id,read_at")
      .single();

    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    console.error("PATCH /api/notifications failed:", error);
    return NextResponse.json({ error: "Unable to update notification." }, { status: 500 });
  }
}
