import { describe, expect, it } from "vitest";

import {
  formatCustomId,
  parseCustomId,
} from "@/lib/ids";

describe("custom ID helpers", () => {
  it("formats four-digit policy IDs", () => {
    expect(formatCustomId("POLICY", 1)).toBe("PC-0001");
    expect(formatCustomId("POLICY", 42)).toBe("PC-0042");
    expect(formatCustomId("POLICY", 9999)).toBe("PC-9999");
    expect(formatCustomId("POLICY", 10000)).toBe("PC-10000");
  });

  it("formats four-digit event IDs", () => {
    expect(formatCustomId("EVENT", 1)).toBe("EV-0001");
    expect(formatCustomId("EVENT", 12)).toBe("EV-0012");
  });

  it("parses IDs case-insensitively", () => {
    expect(parseCustomId("pc-4")).toEqual({
      entity: "POLICY",
      sequence: 4n,
    });

    expect(parseCustomId(" EV-0012 ")).toEqual({
      entity: "EVENT",
      sequence: 12n,
    });
  });

  it("rejects malformed IDs", () => {
    expect(parseCustomId("policy-0001")).toBeNull();
    expect(parseCustomId("PC-0000")).toBeNull();
    expect(parseCustomId("EV-x12")).toBeNull();
    expect(parseCustomId("")).toBeNull();
  });

  it("rejects non-positive sequences when formatting", () => {
    expect(() => formatCustomId("POLICY", 0)).toThrow();
  });
});
