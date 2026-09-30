"use client";

import { ReactNode, useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Header } from "./Header";
import { MobileDrawer } from "./MobileDrawer";
import { Sidebar } from "./Sidebar";
import { createClient } from "@/lib/supabase/client";

type DashboardLayoutProps = {
  children: ReactNode;
};

type SessionUser = {
  email: string;
  role: string | null;
  unread: number;
};

const SIDEBAR_STORAGE_KEY = "govai.sidebar.collapsed";

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sessionUser, setSessionUser] = useState<SessionUser>({ email: "", role: null, unread: 0 });

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (saved === "true" || saved === "false") setSidebarCollapsed(saved === "true");
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      const modifier = event.ctrlKey || event.metaKey;

      if (modifier && event.key.toLowerCase() === "b" && !typing) {
        event.preventDefault();
        toggleSidebar();
      }

      if (modifier && event.key.toLowerCase() === "k") {
        event.preventDefault();
        window.dispatchEvent(new Event("govai:focus-search"));
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [toggleSidebar]);

  // Load the session once per app mount instead of refetching auth/profile/notifications
  // on every route change. Route changes should only update the page content.
  useEffect(() => {
    const supabase = createClient();
    let active = true;

    async function loadUser(userId?: string, email?: string) {
      const user = userId
        ? { id: userId, email: email ?? "" }
        : (await supabase.auth.getUser()).data.user;

      if (!active || !user) return;

      const [{ data: profile }, notificationResult] = await Promise.all([
        supabase.from("users").select("role").eq("id", user.id).maybeSingle<{ role: string | null }>(),
        supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
      ]);

      if (!active) return;
      setSessionUser({
        email: user.email ?? "",
        role: profile?.role ?? null,
        unread: notificationResult.count ?? 0,
      });
    }

    void loadUser();

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "SIGNED_OUT" || !session?.user) {
        setSessionUser({ email: "", role: null, unread: 0 });
        return;
      }

      // Refresh only when the authentication state actually changes.
      void loadUser(session.user.id, session.user.email ?? "");
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  if (pathname === "/login") return <>{children}</>;

  return (
    <div className="min-h-screen bg-transparent">
      <Header
        email={sessionUser.email}
        role={sessionUser.role}
        unread={sessionUser.unread}
        sidebarCollapsed={sidebarCollapsed}
        onSidebarToggle={toggleSidebar}
        onMobileOpen={() => setMobileOpen(true)}
      />

      <div className="flex min-h-[calc(100vh-72px)] w-full">
        <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
        <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} />

        <main className="min-w-0 flex-1">
          <div className="mx-auto min-h-[calc(100vh-72px)] w-full max-w-[1800px] px-3 py-4 pb-24 sm:px-5 sm:py-6 sm:pb-8 lg:px-8 xl:px-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
