export type MeetingPermissionInput = { userId: string; creatorId: string; assignedApproverId?: string | null; role: string };

export function canManageMeeting(input: MeetingPermissionInput): boolean {
  return input.userId === input.creatorId || input.role === "Super Admin";
}

export function canApproveMeeting(input: MeetingPermissionInput): boolean {
  return input.role === "Super Admin" || (!!input.assignedApproverId && input.userId === input.assignedApproverId);
}
