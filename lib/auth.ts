import { createClient } from "@/lib/supabase/server";
import { Profile, Role } from "@/types/domain";

const normalizeRole = (role: Role): Role => role === "Coordinators" ? "Coordinator" : role;

export async function requireUser(roles?: Role[]) {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("UNAUTHORIZED");
  }

  const { data: rawProfile, error: profileError } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  if (profileError || !rawProfile) {
    throw new Error("PROFILE_NOT_FOUND");
  }

  const profile: Profile = { ...rawProfile, role: normalizeRole(rawProfile.role) };
  const allowedRoles = roles?.map(normalizeRole);

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    throw new Error("FORBIDDEN");
  }

  return {
    supabase,
    user,
    profile,
  };
}