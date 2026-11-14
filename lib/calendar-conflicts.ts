export function getMeetingQueryStart(startDate: string, longestDurationMinutes: number, timezoneOffset = "+05:30") {
  const windowStart = new Date(`${startDate}T00:00:00${timezoneOffset}`).getTime();
  const duration = Number.isFinite(longestDurationMinutes) && longestDurationMinutes > 0
    ? longestDurationMinutes
    : 60;
  return new Date(windowStart - duration * 60_000).toISOString();
}

export function intervalsOverlap(start: number, end: number, busyStart: number, busyEnd: number) {
  return start < busyEnd && end > busyStart;
}

export function isValidBusyInterval(start: number, end: number) {
  return Number.isFinite(start) && Number.isFinite(end) && end > start;
}
