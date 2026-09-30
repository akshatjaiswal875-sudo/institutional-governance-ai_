import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { Profile, Role } from "@/types/domain";

const normalizeRole = (role: Role): Role => role === "Coordinators" ? "Coordinator" : role;

const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) throw new Error("UNAUTHORIZED");

  const { data: rawProfile, error: profileError } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  if (profileError || !rawProfile) throw new Error("PROFILE_NOT_FOUND");

  return {
    supabase,
    user,
    profile: { ...rawProfile, role: normalizeRole(rawProfile.role) } as Profile,
  };
});

export async function requireUser(roles?: Role[]) {
  const current = await getCurrentUser();
  const allowedRoles = roles?.map(normalizeRole);

  if (allowedRoles && !allowedRoles.includes(current.profile.role)) {
    throw new Error("FORBIDDEN");
  }

  return current;
}
