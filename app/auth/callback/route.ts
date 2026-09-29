import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function safeNext(value: string | null, fallback: string) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const requestedNext = safeNext(url.searchParams.get("next"), "");

  if (!code && !tokenHash) {
    return NextResponse.redirect(new URL("/login?error=Missing authentication callback code.", url.origin));
  }

  try {
    const supabase = await createClient();

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
    } else if (tokenHash && type) {
      const allowedTypes = ["invite", "signup", "recovery", "email_change"] as const;
      if (!allowedTypes.includes(type as (typeof allowedTypes)[number])) {
        throw new Error("Unsupported authentication link type.");
      }
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as "invite" | "signup" | "recovery" | "email_change",
      });
      if (error) throw error;
    }

    // Invite links must land on the password setup page before the user can
    // enter the application. Recovery links use the reset-password page.
    // For PKCE/code callbacks Supabase may not include `type`, so an explicit
    // next=/set-password is honored and the no-next code flow defaults to
    // password setup rather than accidentally sending a new invite to login.
    const destination = type === "invite"
      ? "/set-password"
      : type === "recovery"
        ? "/reset-password"
        : requestedNext || (code ? "/set-password" : "/dashboard");

    return NextResponse.redirect(new URL(destination, url.origin));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authentication callback failed.";
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, url.origin));
  }
}
