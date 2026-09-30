import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";
import { PolicyVersionError } from "@/lib/policy-version";

export async function requirePolicyActor() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) throw new PolicyVersionError("FORBIDDEN", "You must be signed in.");
  const actor = await prisma.user.findUnique({ where: { email: user.email.toLowerCase() } });
  if (!actor || actor.deletedAt) throw new PolicyVersionError("FORBIDDEN", "Your governance profile could not be found.");
  return actor as { id: string; role: Role };
}
