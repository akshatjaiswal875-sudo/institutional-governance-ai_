import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { GoogleGenAI } from "@google/genai";
import { client as openAIClient } from "@/lib/ai/openai";

const SEARCH_DAYS = 7;
const SLOT_STEP_MINUTES = 30;
const DEFAULT_DURATION_MINUTES = 60;
const WORK_START_MINUTES = 9 * 60;
const WORK_END_MINUTES = 17 * 60;
const TIME_ZONE_OFFSET = "+05:30"; // Institutional sample data is India-based.

type UserRow = { id: string; email: string; role: string; department: string | null };
type AvailabilityRow = { user_id: string; day_of_week: number; start_time: string; end_time: string; available: boolean };
type BusyItem = { user_id: string; start: number; end: number; source: "event" | "meeting" };
type Candidate = {
  start: string;
  end: string;
  startEpoch: number;
  endEpoch: number;
  availableCount: number;
  participantCount: number;
  score: number;
  reason: string;
};

function clampDuration(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_DURATION_MINUTES;
  return Math.min(180, Math.max(30, Math.round(n / 30) * 30));
}

function isoDateInIndia(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function addDays(dateString: string, days: number) {
  const base = new Date(`${dateString}T00:00:00${TIME_ZONE_OFFSET}`);
  base.setUTCDate(base.getUTCDate() + days);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(base);
}

function weekdayOneToSeven(dateString: string) {
  const date = new Date(`${dateString}T12:00:00${TIME_ZONE_OFFSET}`);
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

function minutesFromTime(value: string) {
  const [hours, minutes] = String(value).slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

function candidateDateTime(dateString: string, minutes: number) {
  const hours = Math.floor(minutes / 60).toString().padStart(2, "0");
  const mins = (minutes % 60).toString().padStart(2, "0");
  return new Date(`${dateString}T${hours}:${mins}:00${TIME_ZONE_OFFSET}`);
}

function overlaps(start: number, end: number, busy: BusyItem[]) {
  return busy.some(item => start < item.end && end > item.start);
}

function insideAvailability(startMinutes: number, endMinutes: number, rows: AvailabilityRow[]) {
  return rows.some(row => row.available && startMinutes >= minutesFromTime(row.start_time) && endMinutes <= minutesFromTime(row.end_time));
}

function scoreCandidate(candidate: Omit<Candidate, "score" | "reason">, busy: BusyItem[]) {
  let score = 100;
  const startDate = new Date(candidate.startEpoch);
  const startMinutes = startDate.getUTCHours() * 60 + startDate.getUTCMinutes() + 330;
  const localMinutes = startMinutes % (24 * 60);
  if (localMinutes < 10 * 60) score -= 4;
  if (localMinutes >= 16 * 60) score -= 6;
  const adjacentBusy = busy.some(item => Math.abs(item.end - candidate.startEpoch) <= 15 * 60 * 1000 || Math.abs(item.start - candidate.endEpoch) <= 15 * 60 * 1000);
  if (adjacentBusy) score -= 8;
  return Math.max(0, score);
}

async function rankWithAI(candidates: Candidate[], users: UserRow[]) {
  if (!candidates.length) return { candidates, provider: "none" as const };

  const compact = candidates.slice(0, 12).map((slot, index) => ({
    index,
    start: slot.start,
    end: slot.end,
    availableCount: slot.availableCount,
    participantCount: slot.participantCount,
    deterministicScore: slot.score,
  }));
  const participantSummary = users.map(user => ({ role: user.role, department: user.department, email: user.email }));
  const prompt = `You are an institutional meeting scheduler. Rank candidate meeting slots; do not invent slots and do not change their times. Prefer all participants available, normal working hours, earlier suitable times, and avoid awkward edge-of-day slots. Return JSON only: {"ranking":[{"index":number,"score":number,"reason":string}]}. Participants: ${JSON.stringify(participantSummary)}. Candidates: ${JSON.stringify(compact)}`;

  try {
    if (process.env.GEMINI_API_KEY?.trim()) {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || "gemini-3-flash",
        contents: prompt,
        config: { responseMimeType: "application/json", temperature: 0.1, maxOutputTokens: 1200 },
      });
      const parsed = JSON.parse(response.text || "{}");
      const ranking = Array.isArray(parsed.ranking) ? parsed.ranking : [];
      const byIndex = new Map(ranking.map((item: any) => [Number(item.index), item]));
      return {
        candidates: candidates.map((slot, index) => {
          const aiItem = byIndex.get(index);
          return aiItem ? { ...slot, score: Number(aiItem.score) || slot.score, reason: String(aiItem.reason || slot.reason) } : slot;
        }).sort((a, b) => b.score - a.score),
        provider: "gemini" as const,
      };
    }

    if (process.env.OPENAI_API_KEY?.trim()) {
      const response = await openAIClient.get().chat.completions.create({
        model: process.env.OPENAI_CHAT_MODEL || "gpt-5.6-luna",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Rank meeting slots. Never invent or modify a candidate time. Return JSON only with ranking:[{index,score,reason}]." },
          { role: "user", content: `${prompt}\nCandidates: ${JSON.stringify(compact)}` },
        ],
      });
      const parsed = JSON.parse(response.choices[0]?.message?.content || "{}");
      const ranking = Array.isArray(parsed.ranking) ? parsed.ranking : [];
      const byIndex = new Map(ranking.map((item: any) => [Number(item.index), item]));
      return {
        candidates: candidates.map((slot, index) => {
          const aiItem = byIndex.get(index);
          return aiItem ? { ...slot, score: Number(aiItem.score) || slot.score, reason: String(aiItem.reason || slot.reason) } : slot;
        }).sort((a, b) => b.score - a.score),
        provider: "openai" as const,
      };
    }
  } catch {
    // Deterministic ranking remains a safe fallback if an AI provider is unavailable.
  }

  return { candidates: [...candidates].sort((a, b) => b.score - a.score), provider: "deterministic" as const };
}

export async function POST(request: Request) {
  try {
    const { profile } = await requireUser(["Director", "Principal", "HOD", "Coordinator", "Super Admin", "Meeting Secretary"]);
    const body = await request.json();
    const participantIds = Array.isArray(body?.participantIds)
      ? [...new Set(body.participantIds.filter((id: unknown): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)))]
      : [];
    if (!participantIds.length) return NextResponse.json({ error: "Select at least one participant." }, { status: 400 });
    if (participantIds.length > 30) return NextResponse.json({ error: "Select at most 30 participants." }, { status: 400 });

    const durationMinutes = clampDuration(body?.durationMinutes);
    const preferredDate = typeof body?.preferredDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.preferredDate) ? body.preferredDate : null;
    const searchDays = preferredDate ? 1 : SEARCH_DAYS;
    const startDate = preferredDate || isoDateInIndia();
    const endDate = addDays(startDate, searchDays);
    const admin = createAdminClient();

    const [{ data: users, error: usersError }, { data: availability, error: availabilityError }, { data: events, error: eventsError }, { data: meetings, error: meetingsError }] = await Promise.all([
      admin.from("users").select("id,email,role,department").in("id", participantIds),
      admin.from("user_availability").select("user_id,day_of_week,start_time,end_time,available").in("user_id", participantIds),
      admin.from("events").select("id,organizer_id,start_time,end_time").in("organizer_id", participantIds).gte("start_time", `${startDate}T00:00:00${TIME_ZONE_OFFSET}`).lt("start_time", `${endDate}T00:00:00${TIME_ZONE_OFFSET}`),
      admin.from("meetings").select("id,created_by,date").in("created_by", participantIds).gte("date", `${startDate}T00:00:00${TIME_ZONE_OFFSET}`).lt("date", `${endDate}T00:00:00${TIME_ZONE_OFFSET}`),
    ]);

    if (usersError) throw usersError;
    if (availabilityError) throw availabilityError;
    if (eventsError) throw eventsError;
    if (meetingsError) throw meetingsError;
    if (!users || users.length !== participantIds.length) return NextResponse.json({ error: "One or more selected participants could not be found." }, { status: 400 });

    const busy: BusyItem[] = [
      ...(events ?? []).map(event => ({ user_id: event.organizer_id, start: new Date(event.start_time).getTime(), end: new Date(event.end_time).getTime(), source: "event" as const })),
      ...(meetings ?? []).map(meeting => ({ user_id: meeting.created_by, start: new Date(meeting.date).getTime(), end: new Date(meeting.date).getTime() + durationMinutes * 60_000, source: "meeting" as const })),
    ].filter(item => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start);

    const availabilityByUser = new Map<string, AvailabilityRow[]>();
    for (const row of availability ?? []) {
      const list = availabilityByUser.get(row.user_id) ?? [];
      list.push(row);
      availabilityByUser.set(row.user_id, list);
    }

    const candidates: Candidate[] = [];
    for (let dayIndex = 0; dayIndex < searchDays; dayIndex += 1) {
      const dateString = addDays(startDate, dayIndex);
      const weekday = weekdayOneToSeven(dateString);
      for (let minutes = WORK_START_MINUTES; minutes + durationMinutes <= WORK_END_MINUTES; minutes += SLOT_STEP_MINUTES) {
        const endMinutes = minutes + durationMinutes;
        const start = candidateDateTime(dateString, minutes);
        const end = candidateDateTime(dateString, endMinutes);
        const startEpoch = start.getTime();
        const endEpoch = end.getTime();
        const allAvailable = users.every(user => {
          const rows = (availabilityByUser.get(user.id) ?? []).filter(row => Number(row.day_of_week) === weekday);
          return insideAvailability(minutes, endMinutes, rows) && !overlaps(startEpoch, endEpoch, busy.filter(item => item.user_id === user.id));
        });
        if (!allAvailable) continue;
        const base = {
          start: start.toISOString(),
          end: end.toISOString(),
          startEpoch,
          endEpoch,
          availableCount: users.length,
          participantCount: users.length,
        };
        const score = scoreCandidate(base, busy);
        candidates.push({ ...base, score, reason: "All selected participants are available." });
      }
    }

    const ranked = await rankWithAI(candidates, users);
    const publicCandidates = ranked.candidates.slice(0, 8).map(({ startEpoch: _startEpoch, endEpoch: _endEpoch, ...slot }) => slot);
    return NextResponse.json({ data: { recommended: publicCandidates[0] ?? null, alternatives: publicCandidates.slice(1), provider: ranked.provider, searchedFrom: startDate, searchedUntil: endDate, durationMinutes, participantCount: users.length, requestedBy: profile.email } }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to find a common free time.";
    const status = message === "UNAUTHORIZED" || message === "PROFILE_NOT_FOUND" || message === "FORBIDDEN" ? 401 : 500;
    return NextResponse.json({ error: status === 401 ? "You are not allowed to use meeting scheduling." : "Unable to find a common free time." }, { status });
  }
}
