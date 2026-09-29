import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    const { data, error } = await supabase.from("notifications").select("id,type,title,message,href,source_type,source_id,read_at,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    console.error("GET /api/notifications failed:", error);
    return NextResponse.json({ error: "Unable to load notifications." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, user } = await requireUser();
    const body = await request.json();
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "Notification id is required." }, { status: 400 });
    const { data, error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id).select("id,read_at").single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    console.error("PATCH /api/notifications failed:", error);
    return NextResponse.json({ error: "Unable to update notification." }, { status: 500 });
  }
}
