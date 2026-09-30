import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createPolicyVersion, PolicyVersionError } from "@/lib/policy-version";
import { requirePolicyActor } from "@/lib/policy-auth";
import { z } from "zod";

const createSchema = z.object({ title: z.string().trim().min(1).max(200), content: z.string().trim().min(1), changeSummary: z.string().trim().min(1).max(280), baseVersionNumber: z.number().int().min(0) });

function errorResponse(error: unknown) {
  if (error instanceof PolicyVersionError) {
    const status = error.code === "FORBIDDEN" ? 403 : error.code === "NOT_FOUND" ? 404 : error.code === "CONFLICT" ? 409 : 400;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  return NextResponse.json({ error: "Unable to update policy." }, { status: 500 });
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const versions = await prisma.policyVersion.findMany({ where: { policyId: params.id }, orderBy: { versionNumber: "desc" }, select: { id: true, versionNumber: true, title: true, content: true, changeSummary: true, createdAt: true, createdBy: { select: { id: true, name: true, email: true, role: true } } } });
    return NextResponse.json({ data: versions });
  } catch { return NextResponse.json({ error: "Unable to load policy history." }, { status: 500 }); }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requirePolicyActor();
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
    const version = await createPolicyVersion({ policyId: params.id, actor, ...parsed.data });
    return NextResponse.json({ data: version }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
