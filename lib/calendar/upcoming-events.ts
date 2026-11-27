export type DashboardEvent = {
  start_time?: string | null;
  status?: string | null;
};

/**
 * Return only events whose start time is strictly in the future.
 * Events already in progress are intentionally excluded from "Upcoming".
 */
export function getFutureEvents<T extends DashboardEvent>(
  events: T[],
  now = Date.now(),
  limit = 4,
): T[] {
  return events
    .filter((event) => {
      const startTime = Date.parse(event.start_time ?? "");
      const status = String(event.status ?? "").trim().toLowerCase();
      return Number.isFinite(startTime)
        && startTime > now
        && status !== "cancelled"
        && status !== "completed";
    })
    .sort((a, b) => Date.parse(a.start_time ?? "") - Date.parse(b.start_time ?? ""))
    .slice(0, Math.max(0, limit));
}
