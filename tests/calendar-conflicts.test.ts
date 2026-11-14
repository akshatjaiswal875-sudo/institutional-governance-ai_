import { describe, expect, it } from "vitest";
import { getMeetingQueryStart, intervalsOverlap, isValidBusyInterval } from "@/lib/calendar-conflicts";

describe("calendar conflict interval helpers", () => {
  it("looks back far enough to include a meeting that starts before the search window", () => {
    expect(getMeetingQueryStart("2026-11-14", 90))
      .toBe("2026-11-13T17:00:00.000Z");
  });

  it("uses the default duration when the longest agenda duration is invalid", () => {
    expect(getMeetingQueryStart("2026-11-14", 0))
      .toBe("2026-11-13T17:30:00.000Z");
  });

  it("detects partial overlap at either edge and full containment", () => {
    const busyStart = Date.parse("2026-11-14T03:30:00.000Z");
    const busyEnd = Date.parse("2026-11-14T05:00:00.000Z");
    expect(intervalsOverlap(busyStart - 30_000, busyStart + 30_000, busyStart, busyEnd)).toBe(true);
    expect(intervalsOverlap(busyEnd - 30_000, busyEnd + 30_000, busyStart, busyEnd)).toBe(true);
    expect(intervalsOverlap(busyStart + 10_000, busyEnd - 10_000, busyStart, busyEnd)).toBe(true);
  });

  it("does not treat adjacent intervals as overlapping", () => {
    const busyStart = 1_000;
    const busyEnd = 2_000;
    expect(intervalsOverlap(0, busyStart, busyStart, busyEnd)).toBe(false);
    expect(intervalsOverlap(busyEnd, 3_000, busyStart, busyEnd)).toBe(false);
  });

  it("rejects invalid or zero-length busy intervals", () => {
    expect(isValidBusyInterval(2_000, 1_000)).toBe(false);
    expect(isValidBusyInterval(Number.NaN, 3_000)).toBe(false);
    expect(isValidBusyInterval(1_000, 1_000)).toBe(false);
    expect(isValidBusyInterval(1_000, 2_000)).toBe(true);
  });
});
