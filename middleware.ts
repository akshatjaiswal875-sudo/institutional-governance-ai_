import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and either NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.");

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookiesToSet) { cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options)); },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname, search } = request.nextUrl;
  const publicAuthRoutes = ["/login", "/forgot-password", "/reset-password", "/set-password"];
  const mustChangePassword = user?.app_metadata?.must_change_password === true;

  if (publicAuthRoutes.includes(pathname) && user) {
    if (pathname === "/login") {
      if (mustChangePassword) return NextResponse.redirect(new URL("/set-password?first_login=1", request.url));
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return response;
  }
  if (publicAuthRoutes.includes(pathname) || pathname.startsWith("/auth/callback") || pathname === "/") return response;

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (mustChangePassword && pathname !== "/set-password") {
    return NextResponse.redirect(new URL("/set-password?first_login=1", request.url));
  }

  return response;
}

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
