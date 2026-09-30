import { NextResponse } from "next/server";
import { z } from "zod";
import { restorePolicyVersion, PolicyVersionError } from "@/lib/policy-version";
import { requirePolicyActor } from "@/lib/policy-auth";

const paramsSchema = z.object({ id: z.string().uuid(), version: z.coerce.number().int().positive() });

export async function POST(_request: Request, { params }: { params: { id: string; version: string } }) {
  try {
    const parsed = paramsSchema.safeParse(params);
    if (!parsed.success) return NextResponse.json({ error: "Invalid policy or version." }, { status: 400 });
    const actor = await requirePolicyActor();
    const version = await restorePolicyVersion({ policyId: parsed.data.id, versionNumber: parsed.data.version, actor });
    return NextResponse.json({ data: version });
  } catch (error) {
    if (error instanceof PolicyVersionError) {
      const status = error.code === "FORBIDDEN" ? 403 : error.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    return NextResponse.json({ error: "Unable to restore policy version." }, { status: 500 });
  }
}
