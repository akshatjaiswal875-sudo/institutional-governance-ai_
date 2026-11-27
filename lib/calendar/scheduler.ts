export type AvailabilityRow = { user_id: string; day_of_week: number; start_time: string; end_time: string; available: boolean };
export type PreferenceRow = { user_id: string; timezone: string; preferred_start_time: string | null; preferred_end_time: string | null; default_duration_minutes: number; buffer_minutes: number; max_meetings_per_day: number };
export type UnavailabilityRow = { user_id: string; starts_at: string; ends_at: string };
export type BusyItem = { user_id: string; start: number; end: number; source: "event" | "meeting" | "timetable" };

const weekdays: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const DEFAULT_WORK_START_MINUTES = 9 * 60;
const DEFAULT_WORK_END_MINUTES = 17 * 60;
const DEFAULT_WORK_DAYS = new Set([1, 2, 3, 4, 5]);

export function localWindow(epoch: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone || "Asia/Kolkata", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(epoch));
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  return { weekday: weekdays[get("weekday")] ?? 0, date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}
function minutesFromTime(value: string) { const [hours, minutes] = String(value).slice(0, 5).split(":").map(Number); return hours * 60 + minutes; }
function overlaps(start: number, end: number, busy: BusyItem[]) { return busy.some(item => start < item.end && end > item.start); }

export type AvailabilityFailureReason = "invalid_window" | "outside_weekly_availability" | "outside_preferred_hours" | "unavailable_exception" | "calendar_conflict" | "daily_meeting_limit" | null;

export function participantAvailabilityFailure(input: {
  startEpoch: number; endEpoch: number; availability: AvailabilityRow[];
  preference: PreferenceRow; busy: BusyItem[]; exceptions: UnavailabilityRow[];
}): AvailabilityFailureReason {
  const { startEpoch, endEpoch, availability, preference, busy, exceptions } = input;
  const timezone = preference.timezone || "Asia/Kolkata";
  const start = localWindow(startEpoch, timezone);
  const end = localWindow(endEpoch, timezone);
  if (endEpoch <= startEpoch || start.date !== end.date || start.weekday !== end.weekday) return "invalid_window";

  // Apply defaults per weekday, not per user. A saved Monday schedule must
  // not accidentally make Tuesday-Sunday unavailable when those days have
  // no rows. An explicit row (including available=false) overrides the default.
  const dayRows = availability.filter(row => row.day_of_week === start.weekday);
  const weekly = dayRows.length === 0
    ? DEFAULT_WORK_DAYS.has(start.weekday) && start.minutes >= DEFAULT_WORK_START_MINUTES && end.minutes <= DEFAULT_WORK_END_MINUTES
    : dayRows.some(row => row.available && start.minutes >= minutesFromTime(row.start_time) && end.minutes <= minutesFromTime(row.end_time));
  if (!weekly) return "outside_weekly_availability";
  if (preference.preferred_start_time && start.minutes < minutesFromTime(preference.preferred_start_time)) return "outside_preferred_hours";
  if (preference.preferred_end_time && end.minutes > minutesFromTime(preference.preferred_end_time)) return "outside_preferred_hours";
  if (exceptions.some(item => startEpoch < new Date(item.ends_at).getTime() && endEpoch > new Date(item.starts_at).getTime())) return "unavailable_exception";
  const bufferMs = Math.max(0, Number(preference.buffer_minutes) || 0) * 60_000;
  const buffered = busy.map(item => ({ ...item, start: item.start - bufferMs, end: item.end + bufferMs }));
  if (overlaps(startEpoch, endEpoch, buffered)) return "calendar_conflict";
  const meetingCount = busy.filter(item => item.source === "meeting" && localWindow(item.start, timezone).date === start.date).length;
  if (meetingCount >= Math.max(1, Number(preference.max_meetings_per_day) || 5)) return "daily_meeting_limit";
  return null;
}

export function isParticipantAvailable(input: {
  startEpoch: number; endEpoch: number; availability: AvailabilityRow[];
  preference: PreferenceRow; busy: BusyItem[]; exceptions: UnavailabilityRow[];
}) {
  return participantAvailabilityFailure(input) === null;
}

/**
 * Candidate grid is intentionally wider than the default working-hours policy.
 * Saved participant windows can be outside 09:00–17:00; each candidate is
 * subsequently checked against every participant's local availability.
 */
export function buildCandidateMinutes(
  durationMinutes: number,
  startMinutes = 6 * 60,
  endMinutes = 22 * 60,
  stepMinutes = 30,
): number[] {
  if (![durationMinutes, startMinutes, endMinutes, stepMinutes].every(Number.isFinite)
    || durationMinutes <= 0 || stepMinutes <= 0 || startMinutes < 0
    || endMinutes > 24 * 60 || startMinutes >= endMinutes) return [];
  const slots: number[] = [];
  for (let minute = startMinutes; minute + durationMinutes <= endMinutes; minute += stepMinutes) {
    slots.push(minute);
  }
  return slots;
}
