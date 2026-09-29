import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const params = await searchParams;

  // Supabase Dashboard invitations can return to the configured Site URL
  // with type=invite instead of our callback route. Never send an invited
  // user straight to the dashboard before they create their password.
  if (user && params.type === "invite") redirect("/set-password");
  if (user && params.type === "recovery") redirect("/reset-password");

  redirect(user ? "/dashboard" : "/login");
}
