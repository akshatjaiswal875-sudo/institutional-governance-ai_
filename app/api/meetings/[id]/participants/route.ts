import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";

const ASSIGNABLE_ROLES = ["HOD", "Faculty / Officer", "Director", "Principal", "Super Admin", "Meeting Secretary", "Coordinators", "Coordinator"] as const;
type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase, profile } = await requireUser();
    const { data: meeting, error: meetingError } = await supabase.from("meetings").select("id,created_by").eq("id", params.id).maybeSingle();
    if (meetingError) throw meetingError;
    if (!meeting) return NextResponse.json({ error: "Meeting not found." }, { status: 404 });
    if (meeting.created_by !== profile.id && profile.role !== "Super Admin") return NextResponse.json({ data: { users: [], departments: [], currentRole: profile.role, currentUserId: profile.id, currentDepartment: profile.department } });

    const admin = createAdminClient();
    const { data: directory, error: directoryError } = await admin.from("users").select("department").not("department", "is", null);
    if (directoryError) throw directoryError;
    const departments = [...new Set((directory ?? []).map(row => typeof row.department === "string" ? row.department.trim() : "").filter(Boolean))].sort((a, b) => a.localeCompare(b));

    const url = new URL(request.url);
    const department = url.searchParams.get("department")?.trim() ?? "";
    const requestedRole = url.searchParams.get("role")?.trim() ?? "";
    const role: AssignableRole | undefined = ASSIGNABLE_ROLES.find(item => item === requestedRole);
    let users: Array<{ id: string; email: string; role: string; department: string | null }> = [];
    const needsDepartment = role === "HOD" || role === "Faculty / Officer" || role === "Faculty";
    if (role && (!needsDepartment || department)) {
      let query = admin.from("users").select("id,email,role,department").eq("role", role).order("email").limit(100);
      if (needsDepartment) query = query.eq("department", department);
      const { data, error } = await query;
      if (error) throw error;
      users = data ?? [];
    }
    return NextResponse.json({ data: { users, departments, currentRole: profile.role, currentUserId: profile.id, currentDepartment: profile.department } });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (error instanceof Error && error.message === "FORBIDDEN") return NextResponse.json({ error: "You do not have permission to view assignment options." }, { status: 403 });
    console.error("[meetings/participants] directory lookup failed", error);
    return NextResponse.json({ error: "Unable to load assignment options." }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase, profile } = await requireUser();
    const body = await request.json();
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    const requestedRole: AssignableRole | undefined = ASSIGNABLE_ROLES.find(item => item === (typeof body.role === "string" ? body.role.trim() : ""));
    const department = typeof body.department === "string" ? body.department.trim() : "";
    const attendanceStatus = typeof body.attendanceStatus === "string" && body.attendanceStatus.trim() ? body.attendanceStatus.trim() : "Invited";
    if (!userId || !requestedRole) return NextResponse.json({ error: "Participant and role are required." }, { status: 400 });
    const needsDepartment = requestedRole === "HOD" || requestedRole === "Faculty / Officer";
    if (needsDepartment && !department) return NextResponse.json({ error: "Choose a valid role and department." }, { status: 400 });
    const { data: meeting } = await supabase.from("meetings").select("id,created_by").eq("id", params.id).maybeSingle();
    if (!meeting) return NextResponse.json({ error: "Meeting not found." }, { status: 404 });
    if (meeting.created_by !== profile.id && profile.role !== "Super Admin") return NextResponse.json({ error: "Only the meeting organizer can add participants." }, { status: 403 });
    const admin = createAdminClient();
    const { data: user, error: userError } = await admin.from("users").select("id,email,role,department").eq("id", userId).maybeSingle();
    if (userError) throw userError;
    if (!user || user.role !== requestedRole || (needsDepartment && user.department !== department)) return NextResponse.json({ error: "Selected account does not match the requested role and department." }, { status: 400 });
    const { data: existing, error: existingError } = await admin.from("participants").select("id").eq("meeting_id", params.id).eq("user_id", userId).maybeSingle();
    if (existingError) throw existingError;
    if (existing) return NextResponse.json({ error: "That participant is already added." }, { status: 409 });
    const { data, error } = await admin.from("participants").insert({ meeting_id: params.id, user_id: userId, attendance_status: attendanceStatus }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await recordAudit(admin, profile.id, "ADD_PARTICIPANT", "participants", data.id, { meeting_id: params.id, user_id: userId, attendance_status: attendanceStatus });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (error instanceof Error && error.message === "FORBIDDEN") return NextResponse.json({ error: "You do not have permission to manage participants." }, { status: 403 });
    return NextResponse.json({ error: "Unable to add participant." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase, profile } = await requireUser();
    const body = await request.json();
    const participantId = typeof body.participantId === "string" ? body.participantId.trim() : "";
    if (!participantId) return NextResponse.json({ error: "Participant is required." }, { status: 400 });
    const { data: meeting } = await supabase.from("meetings").select("id,created_by").eq("id", params.id).maybeSingle();
    if (!meeting) return NextResponse.json({ error: "Meeting not found." }, { status: 404 });
    if (meeting.created_by !== profile.id && profile.role !== "Super Admin") return NextResponse.json({ error: "Only the meeting organizer can remove participants." }, { status: 403 });
    const admin = createAdminClient();
    const { data: participant, error: participantError } = await admin.from("participants").select("id,user_id").eq("id", participantId).eq("meeting_id", params.id).maybeSingle();
    if (participantError) throw participantError;
    if (!participant) return NextResponse.json({ error: "Participant not found." }, { status: 404 });
    const { error } = await admin.from("participants").delete().eq("id", participantId).eq("meeting_id", params.id);
    if (error) throw error;
    await recordAudit(admin, profile.id, "REMOVE_PARTICIPANT", "participants", participantId, { meeting_id: params.id, user_id: participant.user_id });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (error instanceof Error && error.message === "FORBIDDEN") return NextResponse.json({ error: "You do not have permission to manage participants." }, { status: 403 });
    return NextResponse.json({ error: "Unable to remove participant." }, { status: 500 });
  }
}
