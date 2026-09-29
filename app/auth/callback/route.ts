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

  // Supabase invite links can use the implicit flow and return the session in
  // the URL hash. Hash fragments are not sent to the server, so there is no
  // code/token_hash to exchange here. If the invite explicitly targets
  // password setup, send the browser to /set-password so its Supabase client
  // can consume the hash and establish the session.
  if (!code && !tokenHash && (type === "invite" || requestedNext === "/set-password")) {
    return NextResponse.redirect(new URL("/set-password", url.origin));
  }

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

    const destination = type === "invite"
      ? "/set-password"
      : type === "recovery"
        ? "/reset-password"
        : requestedNext || "/dashboard";

    return NextResponse.redirect(new URL(destination, url.origin));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authentication callback failed.";
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, url.origin));
  }
}
