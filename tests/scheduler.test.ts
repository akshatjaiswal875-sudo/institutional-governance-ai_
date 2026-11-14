import { describe, expect, it } from "vitest";
import { isParticipantAvailable, type AvailabilityRow, type BusyItem, type PreferenceRow, type UnavailabilityRow } from "@/lib/calendar/scheduler";

const recurringIndia: AvailabilityRow[] = [{ user_id: "fixture-india", day_of_week: 1, start_time: "19:00", end_time: "21:00", available: true }];
const recurringNewYork: AvailabilityRow[] = [{ user_id: "fixture-ny", day_of_week: 1, start_time: "09:00", end_time: "12:00", available: true }];
const india: PreferenceRow = { user_id: "fixture-india", timezone: "Asia/Kolkata", preferred_start_time: "19:00", preferred_end_time: "21:00", default_duration_minutes: 60, buffer_minutes: 15, max_meetings_per_day: 4 };
const newYork: PreferenceRow = { ...india, user_id: "fixture-ny", timezone: "America/New_York", preferred_start_time: "09:00", preferred_end_time: "12:00" };
// 2026-11-16 19:30 IST == 2026-11-16 09:00 EST.
const start = Date.parse("2026-11-16T14:00:00.000Z");
const end = start + 60 * 60_000;

describe("scheduler participant constraints (isolated fixtures)", () => {
  it("accepts a recurring slot across two participant timezones", () => {
    expect(isParticipantAvailable({ startEpoch: start, endEpoch: end, availability: recurringIndia, preference: india, busy: [], exceptions: [] })).toBe(true);
    expect(isParticipantAvailable({ startEpoch: start, endEpoch: end, availability: recurringNewYork, preference: newYork, busy: [], exceptions: [] })).toBe(true);
  });
  it("rejects a slot blocked by a leave exception", () => {
    const leave: UnavailabilityRow[] = [{ user_id: "fixture-india", starts_at: new Date(start + 10 * 60_000).toISOString(), ends_at: new Date(start + 40 * 60_000).toISOString() }];
    expect(isParticipantAvailable({ startEpoch: start, endEpoch: end, availability: recurringIndia, preference: india, busy: [], exceptions: leave })).toBe(false);
  });
  it("rejects an existing meeting conflict including the configured buffer", () => {
    const conflict: BusyItem[] = [{ user_id: "fixture-india", start: start + 70 * 60_000, end: start + 100 * 60_000, source: "meeting" }];
    expect(isParticipantAvailable({ startEpoch: start, endEpoch: end, availability: recurringIndia, preference: india, busy: conflict, exceptions: [] })).toBe(false);
  });
  it("enforces the per-local-day meeting cap", () => {
    const meetings: BusyItem[] = Array.from({ length: 4 }, (_, index) => ({ user_id: "fixture-india", start: start - (index + 1) * 90 * 60_000, end: start - (index + 1) * 90 * 60_000 + 30 * 60_000, source: "meeting" as const }));
    expect(isParticipantAvailable({ startEpoch: start, endEpoch: end, availability: recurringIndia, preference: india, busy: meetings, exceptions: [] })).toBe(false);
  });
});
