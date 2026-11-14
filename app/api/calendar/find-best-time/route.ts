import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { GoogleGenAI } from "@google/genai";
import { isParticipantAvailable, localWindow } from "@/lib/calendar/scheduler";

const SEARCH_DAYS = 7;
const SLOT_STEP_MINUTES = 30;
const DEFAULT_DURATION_MINUTES = 60;
const WORK_START_MINUTES = 9 * 60;
const WORK_END_MINUTES = 17 * 60;
const TIME_ZONE_OFFSET = "+05:30";

type UserRow = { id: string; email: string; role: string; department: string | null };
type AvailabilityRow = { user_id: string; day_of_week: number; start_time: string; end_time: string; available: boolean };
type PreferenceRow = { user_id: string; timezone: string; preferred_start_time: string | null; preferred_end_time: string | null; default_duration_minutes: number; buffer_minutes: number; max_meetings_per_day: number };
type UnavailabilityRow = { user_id: string; starts_at: string; ends_at: string };
type BusyItem = { user_id: string; start: number; end: number; source: "event" | "meeting" };
type Candidate = { start: string; end: string; startEpoch: number; endEpoch: number; availableCount: number; participantCount: number; score: number; reason: string };
type AIRankingItem = { score?: number; reason?: string; index?: number };

function clampDuration(value: unknown) { const n = Number(value); if (!Number.isFinite(n)) return DEFAULT_DURATION_MINUTES; return Math.min(180, Math.max(30, Math.round(n / 30) * 30)); }
function isoDateInIndia(date = new Date()) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date); }
function addDays(dateString: string, days: number) { const base = new Date(`${dateString}T00:00:00${TIME_ZONE_OFFSET}`); base.setUTCDate(base.getUTCDate() + days); return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(base); }
function weekdayOneToSeven(dateString: string) { const date = new Date(`${dateString}T12:00:00${TIME_ZONE_OFFSET}`); const day = date.getUTCDay(); return day === 0 ? 7 : day; }
function minutesFromTime(value: string) { const [hours, minutes] = String(value).slice(0, 5).split(":").map(Number); return hours * 60 + minutes; }
function candidateDateTime(dateString: string, minutes: number) { const hours = Math.floor(minutes / 60).toString().padStart(2, "0"); const mins = (minutes % 60).toString().padStart(2, "0"); return new Date(`${dateString}T${hours}:${mins}:00${TIME_ZONE_OFFSET}`); }
function overlaps(start: number, end: number, busy: BusyItem[]) { return busy.some(item => start < item.end && end > item.start); }
function scoreCandidate(candidate: Omit<Candidate, "score" | "reason">, busy: BusyItem[]) { let score = 100; const startDate = new Date(candidate.startEpoch); const localMinutes = (startDate.getUTCHours() * 60 + startDate.getUTCMinutes() + 330) % (24 * 60); if (localMinutes < 10 * 60) score -= 4; if (localMinutes >= 16 * 60) score -= 6; const adjacentBusy = busy.some(item => Math.abs(item.end - candidate.startEpoch) <= 15 * 60 * 1000 || Math.abs(item.start - candidate.endEpoch) <= 15 * 60 * 1000); if (adjacentBusy) score -= 8; return Math.max(0, score); }

async function rankWithAI(candidates: Candidate[], users: UserRow[]) {
  if (!candidates.length) return { candidates, provider: "none" as const };
  const compact = candidates.slice(0, 12).map((slot, index) => ({ index, start: slot.start, end: slot.end, availableCount: slot.availableCount, participantCount: slot.participantCount, deterministicScore: slot.score }));
  const participantSummary = users.map(user => ({ role: user.role, department: user.department }));
  const prompt = `You are an institutional meeting scheduler. Rank only the supplied candidate slots; never invent, remove, or modify a time. Prefer all participants available, normal working hours, earlier suitable times, and avoid awkward edge-of-day slots. Return JSON only: {"ranking":[{"index":number,"score":number,"reason":string}]}. Participants: ${JSON.stringify(participantSummary)}. Candidates: ${JSON.stringify(compact)}`;
  try {
    if (process.env.GEMINI_API_KEY?.trim()) {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({ model: process.env.GEMINI_MODEL || "gemini-3-flash", contents: prompt, config: { responseMimeType: "application/json", temperature: 0.1, maxOutputTokens: 1200 } });
      const parsed = JSON.parse(response.text || "{}");
      const ranking: AIRankingItem[] = Array.isArray(parsed.ranking) ? parsed.ranking : [];
      const byIndex = new Map<number, AIRankingItem>(ranking.map(item => [Number(item.index), item]));
      return { candidates: candidates.map((slot, index) => { const aiItem = byIndex.get(index); const aiScore = Number(aiItem?.score); return aiItem ? { ...slot, score: Number.isFinite(aiScore) ? Math.max(0, Math.min(100, aiScore)) : slot.score, reason: String(aiItem.reason || slot.reason) } : slot; }).sort((a, b) => b.score - a.score), provider: "gemini" as const };
    }
  } catch { /* deterministic fallback */ }
  return { candidates: [...candidates].sort((a, b) => b.score - a.score), provider: "deterministic" as const };
}

export async function POST(request: Request) {
  try {
    const { profile } = await requireUser(["Director", "Principal", "HOD", "Coordinator", "Super Admin", "Meeting Secretary", "Faculty / Officer", "Member"]);
    const body = await request.json();
    const participantIds = Array.isArray(body?.participantIds) ? [...new Set(body.participantIds.filter((id: unknown): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)))] : [];
    if (!participantIds.length) return NextResponse.json({ error: "Select at least one participant." }, { status: 400 });
    if (participantIds.length > 30) return NextResponse.json({ error: "Select at most 30 participants." }, { status: 400 });
    const durationMinutes = body?.durationMinutes == null ? null : clampDuration(body.durationMinutes);
    const preferredDate = typeof body?.preferredDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.preferredDate) ? body.preferredDate : null;
    const searchWindow = body?.searchWindow === "next_week" ? "next_week" : "next_7_days";
    const today = isoDateInIndia();
    const todayWeekday = weekdayOneToSeven(today);
    const daysToNextMonday = todayWeekday === 1 ? 7 : 8 - todayWeekday;
    const nextMonday = addDays(today, daysToNextMonday);
    const searchDays = preferredDate ? 1 : searchWindow === "next_week" ? 5 : SEARCH_DAYS;
    const startDate = preferredDate || (searchWindow === "next_week" ? nextMonday : today);
    const endDate = addDays(startDate, searchDays);
    const admin = createAdminClient();
    const [{ data: users, error: usersError }, { data: availability, error: availabilityError }, { data: preferences, error: preferencesError }, { data: exceptions, error: exceptionsError }, { data: events, error: eventsError }, { data: participantLinks, error: participantLinksError }] = await Promise.all([
      admin.from("users").select("id,email,role,department").in("id", participantIds),
      admin.from("user_availability").select("user_id,day_of_week,start_time,end_time,available").in("user_id", participantIds),
      admin.from("user_scheduling_preferences").select("user_id,timezone,preferred_start_time,preferred_end_time,default_duration_minutes,buffer_minutes,max_meetings_per_day").in("user_id", participantIds),
      admin.from("user_unavailability").select("user_id,starts_at,ends_at").in("user_id", participantIds).lt("starts_at", `${endDate}T00:00:00${TIME_ZONE_OFFSET}`).gt("ends_at", `${startDate}T00:00:00${TIME_ZONE_OFFSET}`),
      admin.from("events").select("id,organizer_id,start_time,end_time,status").in("organizer_id", participantIds).neq("status", "Cancelled").lt("start_time", `${endDate}T00:00:00${TIME_ZONE_OFFSET}`).gt("end_time", `${startDate}T00:00:00${TIME_ZONE_OFFSET}`).is("deleted_at", null),
      admin.from("participants").select("meeting_id,user_id,attendance_status").in("user_id", participantIds),
    ]);
    if (usersError) throw usersError; if (availabilityError) throw availabilityError; if (preferencesError) throw preferencesError; if (exceptionsError) throw exceptionsError; if (eventsError) throw eventsError; if (participantLinksError) throw participantLinksError;
    if (!users || users.length !== participantIds.length) return NextResponse.json({ error: "One or more selected participants could not be found." }, { status: 400 });
    const preferenceByUser = new Map<string, PreferenceRow>();
    for (const row of (preferences ?? []) as PreferenceRow[]) preferenceByUser.set(row.user_id, row);
    const effectivePreferences = new Map<string, PreferenceRow>(users.map(user => [user.id, preferenceByUser.get(user.id) ?? {
      user_id: user.id, timezone: "Asia/Kolkata", preferred_start_time: null, preferred_end_time: null,
      default_duration_minutes: DEFAULT_DURATION_MINUTES, buffer_minutes: 15, max_meetings_per_day: 5,
    }]));
    const effectiveDuration = durationMinutes ?? Math.max(...users.map(user => Number(effectivePreferences.get(user.id)?.default_duration_minutes || DEFAULT_DURATION_MINUTES)));
    const meetingIds = [...new Set((participantLinks ?? []).map(row => row.meeting_id).filter((id): id is string => typeof id === "string"))];
    let meetings: Array<{ id: string; date: string; created_by: string; status: string | null }> = [];
    if (meetingIds.length) { const { data, error } = await admin.from("meetings").select("id,date,created_by,status").in("id", meetingIds).in("status", ["Pending Approval", "Published", "Approved", "Transcribed"]).gte("date", `${startDate}T00:00:00${TIME_ZONE_OFFSET}`).lt("date", `${endDate}T00:00:00${TIME_ZONE_OFFSET}`); if (error) throw error; meetings = data ?? []; }
    const agendaMinutesByMeeting = new Map<string, number>();
    if (meetingIds.length) {
      const { data: agendaRows, error: agendaError } = await admin.from("agenda_items").select("meeting_id,duration_minutes").in("meeting_id", meetingIds);
      if (agendaError) throw agendaError;
      for (const row of agendaRows ?? []) {
        const minutes = Number(row.duration_minutes);
        if (Number.isFinite(minutes) && minutes > 0) agendaMinutesByMeeting.set(row.meeting_id, (agendaMinutesByMeeting.get(row.meeting_id) ?? 0) + minutes);
      }
    }
    const activeParticipantLinks = (participantLinks ?? []).filter(link => String(link.attendance_status ?? "").toLowerCase() !== "declined");
    const busy: BusyItem[] = [
      ...(events ?? []).map(event => ({ user_id: event.organizer_id, start: new Date(event.start_time).getTime(), end: new Date(event.end_time).getTime(), source: "event" as const })),
      ...(meetings ?? []).flatMap(meeting => {
        const linkedUsers = [...new Set([meeting.created_by, ...activeParticipantLinks.filter(link => link.meeting_id === meeting.id).map(link => link.user_id)])];
        const existingDuration = agendaMinutesByMeeting.get(meeting.id) || DEFAULT_DURATION_MINUTES;
        const start = new Date(meeting.date).getTime();
        return linkedUsers.map(userId => ({ user_id: userId, start, end: start + existingDuration * 60_000, source: "meeting" as const }));
      }),
    ].filter(item => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start);
    const availabilityByUser = new Map<string, AvailabilityRow[]>();
    const exceptionsByUser = new Map<string, UnavailabilityRow[]>();
    for (const row of (exceptions ?? []) as UnavailabilityRow[]) { const list = exceptionsByUser.get(row.user_id) ?? []; list.push(row); exceptionsByUser.set(row.user_id, list); }
    for (const row of availability ?? []) { const list = availabilityByUser.get(row.user_id) ?? []; list.push(row); availabilityByUser.set(row.user_id, list); }
    const candidates: Candidate[] = [];
    const nowEpoch = Date.now();
    for (let dayIndex = 0; dayIndex < searchDays; dayIndex += 1) {
      const dateString = addDays(startDate, dayIndex); const weekday = weekdayOneToSeven(dateString);
      for (let minutes = WORK_START_MINUTES; minutes + effectiveDuration <= WORK_END_MINUTES; minutes += SLOT_STEP_MINUTES) {
        const endMinutes = minutes + effectiveDuration; const start = candidateDateTime(dateString, minutes); const end = candidateDateTime(dateString, endMinutes); const startEpoch = start.getTime(); const endEpoch = end.getTime(); if (startEpoch <= nowEpoch) continue;
        let availableCount = 0; let allAvailable = true;
        for (const user of users) {
          const preference = effectivePreferences.get(user.id)!;
          const userAvailability = availabilityByUser.get(user.id) ?? [];
          const userBusy = busy.filter(item => item.user_id === user.id);
          const isAvailable = isParticipantAvailable({
            startEpoch, endEpoch, availability: userAvailability, preference,
            busy: userBusy, exceptions: exceptionsByUser.get(user.id) ?? [],
          });
          if (isAvailable) availableCount += 1; else allAvailable = false;
        }
        if (!allAvailable) continue;
        const base = { start: start.toISOString(), end: end.toISOString(), startEpoch, endEpoch, availableCount, participantCount: users.length }; const score = scoreCandidate(base, busy.filter(item => users.some(user => user.id === item.user_id))); candidates.push({ ...base, score, reason: "All selected participants are available during this slot." });
      }
    }
    const ranked = await rankWithAI(candidates, users);
    const sorted = ranked.candidates.slice(0, 10);
    const [recommended, ...alternatives] = sorted;
    return NextResponse.json({ data: { recommended: recommended ?? null, alternatives, provider: ranked.provider, searchedFrom: startDate, searchedUntil: endDate, searchWindow, durationMinutes: effectiveDuration, participantCount: users.length, participants: users.map(user => ({ id: user.id, email: user.email, role: user.role, department: user.department })) } });
  } catch (error) {
    console.error("find-best-time error", error);
    return NextResponse.json({ error: "Unable to calculate meeting availability." }, { status: 500 });
  }
}
