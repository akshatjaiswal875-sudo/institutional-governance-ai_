import { describe, expect, it } from "vitest";
import { canApproveMeeting, canManageMeeting } from "../lib/meeting-permissions";

describe("owner-based meeting permissions", () => {
  const meeting = { creatorId: "owner", assignedApproverId: "approver" };
  it("allows only the creator and Super Admin to manage content", () => {
    expect(canManageMeeting({ ...meeting, userId: "owner", role: "Faculty" })).toBe(true);
    expect(canManageMeeting({ ...meeting, userId: "admin", role: "Super Admin" })).toBe(true);
    expect(canManageMeeting({ ...meeting, userId: "approver", role: "Faculty / Officer" })).toBe(false);
    expect(canManageMeeting({ ...meeting, userId: "other", role: "Director" })).toBe(false);
  });
  it("limits approval to the assigned approver or Super Admin", () => {
    expect(canApproveMeeting({ ...meeting, userId: "approver", role: "Faculty / Officer" })).toBe(true);
    expect(canApproveMeeting({ ...meeting, userId: "admin", role: "Super Admin" })).toBe(true);
    expect(canApproveMeeting({ ...meeting, userId: "owner", role: "Faculty" })).toBe(false);
    expect(canApproveMeeting({ ...meeting, userId: "other", role: "Director" })).toBe(false);
  });
});
