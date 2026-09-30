import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export class PolicyVersionError extends Error {
  constructor(public readonly code: "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "VALIDATION", message: string) {
    super(message);
    this.name = "PolicyVersionError";
  }
}

type Actor = { id: string; role: "DIRECTOR" | "PRINCIPAL" | "HOD" | "COORDINATOR" | "FACULTY" };

function canEdit(role: Actor["role"]): boolean {
  return role === "DIRECTOR" || role === "PRINCIPAL" || role === "HOD" || role === "COORDINATOR";
}

function validateSummary(summary: string): string {
  const value = summary.trim();
  if (!value || value.length > 280) throw new PolicyVersionError("VALIDATION", "A change summary is required and must be at most 280 characters.");
  return value;
}

export async function createPolicyVersion(input: {
  policyId: string;
  actor: Actor;
  title: string;
  content: string;
  changeSummary: string;
  baseVersionNumber: number;
}) {
  if (!canEdit(input.actor.role)) throw new PolicyVersionError("FORBIDDEN", "You do not have permission to edit policies.");
  const title = input.title.trim();
  const content = input.content.trim();
  const summary = validateSummary(input.changeSummary);
  if (!title || !content) throw new PolicyVersionError("VALIDATION", "Policy title and content are required.");

  return prisma.$transaction(async (tx) => {
    const policy = await tx.policy.findUnique({ where: { id: input.policyId }, include: { currentVersion: true } });
    if (!policy || policy.deletedAt) throw new PolicyVersionError("NOT_FOUND", "Policy not found.");
    const latest = policy.currentVersion?.versionNumber ?? 0;
    if (latest !== input.baseVersionNumber) throw new PolicyVersionError("CONFLICT", "This policy changed while you were editing it. Reload the latest version before saving.");

    const version = await tx.policyVersion.create({ data: {
      policyId: policy.id,
      versionNumber: latest + 1,
      title,
      content,
      changeSummary: summary,
      createdById: input.actor.id,
    }});
    await tx.policy.update({ where: { id: policy.id }, data: { currentVersionId: version.id, updatedById: input.actor.id } });
    await tx.auditLog.create({ data: { entityType: "POLICY", entityId: policy.id, action: "VERSION_CREATED", actorId: input.actor.id, metadata: { versionNumber: version.versionNumber, changeSummary: summary } as Prisma.InputJsonValue } });
    return version;
  });
}

export async function restorePolicyVersion(input: { policyId: string; versionNumber: number; actor: Actor }) {
  if (!canEdit(input.actor.role)) throw new PolicyVersionError("FORBIDDEN", "You do not have permission to restore policy versions.");
  return prisma.$transaction(async (tx) => {
    const policy = await tx.policy.findUnique({ where: { id: input.policyId }, include: { currentVersion: true } });
    const source = await tx.policyVersion.findUnique({ where: { policyId_versionNumber: { policyId: input.policyId, versionNumber: input.versionNumber } } });
    if (!policy || !source || policy.deletedAt) throw new PolicyVersionError("NOT_FOUND", "Policy or version not found.");
    const next = (policy.currentVersion?.versionNumber ?? 0) + 1;
    const version = await tx.policyVersion.create({ data: { policyId: policy.id, versionNumber: next, title: source.title, content: source.content, changeSummary: `Restored from v${source.versionNumber}`, createdById: input.actor.id } });
    await tx.policy.update({ where: { id: policy.id }, data: { currentVersionId: version.id, updatedById: input.actor.id } });
    await tx.auditLog.create({ data: { entityType: "POLICY", entityId: policy.id, action: "RESTORE", actorId: input.actor.id, metadata: { restoredFrom: source.versionNumber, newVersion: next } as Prisma.InputJsonValue } });
    return version;
  });
}
