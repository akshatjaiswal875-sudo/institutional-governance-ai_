import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { PolicyVersionError } from "@/lib/policy-version";

type GovernanceRole = "DIRECTOR" | "PRINCIPAL" | "HOD" | "COORDINATOR" | "FACULTY";

export async function requirePolicyActor(): Promise<{ id: string; role: GovernanceRole }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) throw new PolicyVersionError("FORBIDDEN", "You must be signed in.");

  const actor = await prisma.user.findUnique({
    where: { email: user.email.toLowerCase() },
    select: { id: true, role: true, deletedAt: true },
  });

  if (!actor || actor.deletedAt) {
    throw new PolicyVersionError("FORBIDDEN", "Your governance profile could not be found.");
  }

  return { id: actor.id, role: actor.role as GovernanceRole };
}
