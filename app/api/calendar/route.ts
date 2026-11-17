import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const IST = "+05:30";
const LEADERS = ["Director", "Principal", "HOD", "Coordinator", "Super Admin"];

function dateKey(value: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}
function weekday(value: string) {
  const day = new Date(`${value}T12:00:00${IST}`).getUTCDay();
  return day === 0 ? 7 : day;
}
function atTime(day: string, time: string) {
  return new Date(`${day}T${String(time).slice(0, 8)}${IST}`).toISOString();
}

export async function GET(request: NextRequest) {
  try {
    const { supabase, user, profile } = await requireUser();
    const fromValue = request.nextUrl.searchParams.get("from");
    const toValue = request.nextUrl.searchParams.get("to");
    if (!fromValue || !toValue || !Number.isFinite(Date.parse(fromValue)) || !Number.isFinite(Date.parse(toValue)) || Date.parse(toValue) <= Date.parse(fromValue)) {
      return NextResponse.json({ error: "A valid calendar date range is required." }, { status: 400 });
    }
    const from = new Date(fromValue).toISOString();
    const to = new Date(toValue).toISOString();
    const admin = createAdminClient();

    const [meetingResult, eventResult, taskResult, datedTimetableResult, weeklyTimetableResult] = await Promise.all([
      supabase.from("meetings").select("id,title,date,location,status,created_by").gte("date", from).lt("date", to).order("date"),
      (async () => {
        const query = admin.from("events").select("id,title,start_time,end_time,location,status,organizer_id").gte("start_time", from).lt("start_time", to).order("start_time");
        return LEADERS.includes(profile.role) ? query : query.eq("status", "Published");
      })(),
      admin.from("action_items").select("id,task,due_date,status,assignee_id,created_by,meeting_id").or(`assignee_id.eq.${profile.id},created_by.eq.${profile.id}`).gte("due_date", from.slice(0, 10)).lt("due_date", to.slice(0, 10)).order("due_date"),
      admin.from("institutional_timetable_entries").select("id,title,starts_at,ends_at,faculty_email,created_by,is_recurring_weekly,weekday,start_time,end_time,room").eq("created_by", profile.id).eq("is_recurring_weekly", false).lt("starts_at", to).gt("ends_at", from),
      admin.from("institutional_timetable_entries").select("id,title,faculty_email,created_by,is_recurring_weekly,weekday,start_time,end_time,room").eq("created_by", profile.id).eq("is_recurring_weekly", true),
    ]);

    const failed = [meetingResult, eventResult, taskResult, datedTimetableResult, weeklyTimetableResult].find(result => result.error);
    if (failed?.error) {
      console.error("[calendar] source query failed", { code: failed.error.code, message: failed.error.message });
      return NextResponse.json({ error: "Some calendar records could not be loaded. Please check calendar database permissions." }, { status: 500 });
    }

    const items: Array<Record<string, unknown>> = [];
    for (const row of meetingResult.data ?? []) items.push({
      id: `meeting:${row.id}`, sourceId: row.id, kind: "meeting", title: row.title || "Meeting",
      start: row.date, end: null, location: row.location, status: row.status, href: `/meetings/${row.id}`,
    });
    for (const row of eventResult.data ?? []) items.push({
      id: `event:${row.id}`, sourceId: row.id, kind: "event", title: row.title || "Institutional event",
      start: row.start_time, end: row.end_time, location: row.location, status: row.status, href: `/events/${row.id}`,
    });
    for (const row of taskResult.data ?? []) if (row.due_date) {
      const due = String(row.due_date).slice(0, 10);
      items.push({
        id: `task:${row.id}`, sourceId: row.id, kind: "task", title: row.task || "Action item",
        start: `${due}T09:00:00${IST}`, end: null, location: null, status: row.status,
        href: "/my-workspace", allDay: true,
      });
    }
    for (const row of datedTimetableResult.data ?? []) items.push({
      id: `timetable:${row.id}`, sourceId: row.id, kind: "timetable", title: row.title || "Class",
      start: row.starts_at, end: row.ends_at, location: row.room, status: "Scheduled", href: null,
    });

    const firstDay = dateKey(new Date(from));
    const lastDay = dateKey(new Date(Date.parse(to) - 1));
    for (const row of weeklyTimetableResult.data ?? []) {
      if (!row.weekday || !row.start_time || !row.end_time) continue;
      let cursor = firstDay;
      while (cursor <= lastDay) {
        if (weekday(cursor) === row.weekday) items.push({
          id: `timetable:${row.id}:${cursor}`, sourceId: row.id, kind: "timetable", title: row.title || "Class",
          start: atTime(cursor, row.start_time), end: atTime(cursor, row.end_time), location: row.room,
          status: "Scheduled", href: null, recurring: true,
        });
        const next = new Date(`${cursor}T12:00:00${IST}`);
        next.setUTCDate(next.getUTCDate() + 1);
        cursor = dateKey(next);
      }
    }

    items.sort((a, b) => Date.parse(String(a.start)) - Date.parse(String(b.start)));
    return NextResponse.json({ data: items, range: { from, to }, counts: {
      meetings: items.filter(item => item.kind === "meeting").length,
      events: items.filter(item => item.kind === "event").length,
      tasks: items.filter(item => item.kind === "task").length,
      timetable: items.filter(item => item.kind === "timetable").length,
    } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load calendar.";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (message === "PROFILE_NOT_FOUND") return NextResponse.json({ error: "Your institutional profile is missing." }, { status: 403 });
    console.error("GET /api/calendar failed:", error);
    return NextResponse.json({ error: "Unable to load calendar." }, { status: 500 });
  }
}
