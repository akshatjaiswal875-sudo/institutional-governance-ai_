"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    const route = async () => {
      // Supabase Dashboard invitations can use the implicit flow and return
      // to the Site URL with auth data in the URL hash. Hash fragments never
      // reach Next.js server components, so handle this in the browser.
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const type = hash.get("type");

      // Let the browser Supabase client consume the invite hash and persist
      // the session before checking the current session.
      await new Promise((resolve) => setTimeout(resolve, 100));
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!active) return;

      if (type === "invite") {
        router.replace("/set-password");
        return;
      }

      if (type === "recovery") {
        router.replace("/reset-password");
        return;
      }

      router.replace(session?.user ? "/dashboard" : "/login");
    };

    void route();
    return () => {
      active = false;
    };
  }, [router]);

  return <div className="flex min-h-screen items-center justify-center text-slate-400">Checking authentication...</div>;
}
