import { describe, expect, it } from "vitest";
import { canEditPolicy, nextVersionNumber, validateChangeSummary, PolicyVersionError } from "./policy-version";

describe("policy version helpers", () => {
  it("increments versions without skipping", () => {
    expect(nextVersionNumber(0)).toBe(1);
    expect(nextVersionNumber(4)).toBe(5);
    expect(nextVersionNumber(null)).toBe(1);
    expect(nextVersionNumber(undefined)).toBe(1);
  });

  it("allows governance editors and rejects faculty", () => {
    expect(canEditPolicy("DIRECTOR")).toBe(true);
    expect(canEditPolicy("PRINCIPAL")).toBe(true);
    expect(canEditPolicy("HOD")).toBe(true);
    expect(canEditPolicy("COORDINATOR")).toBe(true);
    expect(canEditPolicy("FACULTY")).toBe(false);
  });

  it("requires a non-empty summary up to 280 characters", () => {
    expect(validateChangeSummary("  Updated quorum rules  ")).toBe("Updated quorum rules");
    expect(() => validateChangeSummary(" ")).toThrow(PolicyVersionError);
    expect(() => validateChangeSummary("x".repeat(281))).toThrow(PolicyVersionError);
  });
});
