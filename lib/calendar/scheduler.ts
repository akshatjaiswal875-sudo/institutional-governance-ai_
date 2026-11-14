export type AvailabilityRow = { user_id: string; day_of_week: number; start_time: string; end_time: string; available: boolean };
export type PreferenceRow = { user_id: string; timezone: string; preferred_start_time: string | null; preferred_end_time: string | null; default_duration_minutes: number; buffer_minutes: number; max_meetings_per_day: number };
export type UnavailabilityRow = { user_id: string; starts_at: string; ends_at: string };
export type BusyItem = { user_id: string; start: number; end: number; source: "event" | "meeting" | "timetable" };

const weekdays: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
export function localWindow(epoch: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone || "Asia/Kolkata", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(epoch));
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  return { weekday: weekdays[get("weekday")] ?? 0, date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}
function minutesFromTime(value: string) { const [hours, minutes] = String(value).slice(0, 5).split(":").map(Number); return hours * 60 + minutes; }
function overlaps(start: number, end: number, busy: BusyItem[]) { return busy.some(item => start < item.end && end > item.start); }

export function isParticipantAvailable(input: {
  startEpoch: number; endEpoch: number; availability: AvailabilityRow[];
  preference: PreferenceRow; busy: BusyItem[]; exceptions: UnavailabilityRow[];
}) {
  const { startEpoch, endEpoch, availability, preference, busy, exceptions } = input;
  const timezone = preference.timezone || "Asia/Kolkata";
  const start = localWindow(startEpoch, timezone);
  const end = localWindow(endEpoch, timezone);
  if (endEpoch <= startEpoch || start.date !== end.date || start.weekday !== end.weekday) return false;
  const weekly = availability.some(row => row.available && row.day_of_week === start.weekday &&
    start.minutes >= minutesFromTime(row.start_time) && end.minutes <= minutesFromTime(row.end_time));
  if (!weekly) return false;
  if (preference.preferred_start_time && start.minutes < minutesFromTime(preference.preferred_start_time)) return false;
  if (preference.preferred_end_time && end.minutes > minutesFromTime(preference.preferred_end_time)) return false;
  if (exceptions.some(item => startEpoch < new Date(item.ends_at).getTime() && endEpoch > new Date(item.starts_at).getTime())) return false;
  const bufferMs = Math.max(0, Number(preference.buffer_minutes) || 0) * 60_000;
  const buffered = busy.map(item => ({ ...item, start: item.start - bufferMs, end: item.end + bufferMs }));
  if (overlaps(startEpoch, endEpoch, buffered)) return false;
  const meetingCount = busy.filter(item => item.source === "meeting" &&
    localWindow(item.start, timezone).date === start.date).length;
  if (meetingCount >= Math.max(1, Number(preference.max_meetings_per_day) || 5)) return false;
  return true;
}
