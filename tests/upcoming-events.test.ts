import { describe, expect, it } from "vitest";
import { getFutureEvents } from "@/lib/calendar/upcoming-events";

const now = Date.parse("2026-11-27T12:00:00.000Z");

describe("dashboard upcoming events", () => {
  it("shows only events that start strictly in the future", () => {
    const events = [
      { id: "past", start_time: "2026-09-30T10:00:00.000Z", status: "Published" },
      { id: "started", start_time: "2026-11-27T11:00:00.000Z", end_time: "2026-11-27T13:00:00.000Z", status: "Ongoing" },
      { id: "exact-now", start_time: "2026-11-27T12:00:00.000Z", status: "Published" },
      { id: "future", start_time: "2026-11-28T09:00:00.000Z", status: "Published" },
    ];

    expect(getFutureEvents(events, now).map((event) => event.id)).toEqual(["future"]);
  });

  it("excludes cancelled and completed events even if their start time is future", () => {
    const events = [
      { id: "cancelled", start_time: "2026-11-28T09:00:00.000Z", status: "Cancelled" },
      { id: "completed", start_time: "2026-11-29T09:00:00.000Z", status: "Completed" },
      { id: "published", start_time: "2026-11-30T09:00:00.000Z", status: "Published" },
    ];

    expect(getFutureEvents(events, now).map((event) => event.id)).toEqual(["published"]);
  });

  it("ignores invalid dates, sorts nearest first, and limits the result", () => {
    const events = [
      { id: "later", start_time: "2026-12-02T09:00:00.000Z", status: "Published" },
      { id: "invalid", start_time: "not-a-date", status: "Published" },
      { id: "nearest", start_time: "2026-11-28T09:00:00.000Z", status: "Published" },
      { id: "middle", start_time: "2026-11-30T09:00:00.000Z", status: "Published" },
    ];

    expect(getFutureEvents(events, now, 2).map((event) => event.id)).toEqual(["nearest", "middle"]);
  });
});
