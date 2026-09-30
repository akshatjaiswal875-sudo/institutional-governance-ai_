"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, Bell, CalendarDays, FileText, LayoutDashboard, Menu, MessageSquare, Search, Users, X, LogOut, ShieldCheck, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Role = "Director" | "Principal" | "HOD" | "Coordinators" | "Coordinator" | "Faculty / Volunteers" | "Super Admin" | "Meeting Secretary" | "Faculty / Officer" | "Member" | "Auditor";

const links = [
  ["/dashboard", "Dashboard", LayoutDashboard],
  ["/calendar", "Calendar", CalendarDays],
  ["/meetings", "Meetings", CalendarDays],
  ["/events", "Events", CalendarDays],
  ["/policies", "Policies", FileText],
  ["/suggestions", "Suggestions", MessageSquare],
  ["/search", "Search", Search],
  ["/assistant", "AI Assistant", MessageSquare],
  ["/reports", "Reports", BarChart3],
  ["/users", "Users", Users],
] as const;

const mobilePrimary = [
  ["/dashboard", "Home", LayoutDashboard],
  ["/calendar", "Calendar", CalendarDays],
  ["/meetings", "Meetings", CalendarDays],
  ["/assistant", "AI", MessageSquare],
] as const;

export function Nav() {
  const pathname = usePathname(); const router = useRouter();
  const [open, setOpen] = useState(false); const [email, setEmail] = useState(""); const [role, setRole] = useState<Role | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [unread, setUnread] = useState(0);
  useEffect(() => {
    const supabase = createClient(); let active = true;
    supabase.auth.getUser().then(async ({ data }) => {
      if (!active || !data.user) return;
      setEmail(data.user.email ?? "");
      const [{ data: profile }, { count }] = await Promise.all([
        supabase.from("users").select("role").eq("id", data.user.id).maybeSingle(),
        supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
      ]);
      if (active) { setRole(profile?.role ?? null); setUnread(count ?? 0); }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => { if (!active) return; if (event === "SIGNED_OUT" || !session?.user) { setEmail(""); setRole(null); setUnread(0); } });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);
  if (pathname === "/login") return null;
  async function logout() { if (busy) return; setBusy(true); setError(""); const { error: e } = await createClient().auth.signOut(); if (e) { setError("We couldn't sign you out right now. Please try again."); setBusy(false); return; } router.replace("/login"); router.refresh(); }
  const visible = links.filter(([href]) => href !== "/users" || ["Director", "Super Admin"].includes(role ?? "")).filter(([href]) => href !== "/reports" || ["Director", "Super Admin", "Auditor", "Meeting Secretary", "Principal"].includes(role ?? ""));
  const closeMenu = () => setOpen(false);
  const firstName = email ? email.split("@")[0].split(/[._-]/)[0] : "there";
  return <>
    <header className="sticky top-0 z-40 border-b border-white/[.06] bg-[#061006]/85 backdrop-blur-2xl"><div className="mx-auto flex max-w-[1500px] items-center gap-3 px-4 py-3 sm:px-6">
      <Link href="/dashboard" className="group mr-auto flex min-w-0 items-center gap-3" onClick={closeMenu}><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#81559B]/45 bg-[#81559B]/15 text-[#D8D8F6] shadow-lg shadow-[#143109]/30 transition group-hover:scale-105"><ShieldCheck size={20} /></span><span className="hidden min-w-0 sm:block"><span className="block text-sm font-bold tracking-tight text-[#D8D8F6]">Gov<span className="text-[#AAAE7F]">AI</span></span><span className="block text-[10px] uppercase tracking-[.18em] text-[#AAAE7F]/65">Governance OS</span></span></Link>
      <nav className="hidden items-center gap-1 xl:flex" aria-label="Primary navigation">{visible.map(([href, label, Icon]) => <Link key={href} href={href} className={`group relative flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${pathname.startsWith(href) ? "bg-[#81559B]/18 text-[#D8D8F6]" : "text-[#D8D8F6]/55 hover:bg-[#AAAE7F]/8 hover:text-[#D8D8F6]"}`}><Icon size={15} className={pathname.startsWith(href) ? "text-[#AAAE7F]" : "text-[#D8D8F6]/35 group-hover:text-[#AAAE7F]"} />{label}{pathname.startsWith(href) && <span className="absolute bottom-0 left-3 right-3 h-px bg-[#AAAE7F]" />}</Link>)}</nav>
      <div className="hidden items-center gap-2 xl:flex"><Link href="/notifications" className="relative rounded-xl p-2.5 text-[#D8D8F6]/55 transition hover:bg-[#81559B]/12 hover:text-[#D8D8F6]" title="Notifications" aria-label="Notifications"><Bell size={18} />{unread > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-[#7E3F8F] px-1 text-center text-[9px] font-bold leading-4 text-white">{unread > 99 ? "99+" : unread}</span>}</Link><div className="ml-1 flex items-center gap-3 border-l border-[#D8D8F6]/10 pl-3"><div className="text-right"><p className="max-w-[180px] truncate text-xs font-medium text-[#D8D8F6]/90">Welcome, {firstName}</p><p className="mt-0.5 text-[10px] uppercase tracking-wider text-[#AAAE7F]/65">{role || "Your workspace"}</p></div><div className="h-9 w-9 rounded-full border border-[#81559B]/40 bg-gradient-to-br from-[#81559B]/35 to-[#143109] text-center text-xs font-bold leading-9 text-[#D8D8F6]">{(email?.[0] || "U").toUpperCase()}</div><button type="button" className="rounded-lg p-2 text-[#D8D8F6]/35 transition hover:bg-[#81559B]/12 hover:text-[#D8D8F6]" onClick={logout} disabled={busy} title="Sign out"><LogOut size={16} /></button></div></div>
      <button type="button" className="btn btn-secondary min-h-10 min-w-10 px-2 xl:hidden" onClick={() => setOpen(!open)} aria-label="Toggle navigation" aria-expanded={open}>{open ? <X size={19} /> : <Menu size={19} />}</button>
    </div>
    {open && <div className="border-t border-[#D8D8F6]/10 bg-[#061006]/97 p-4 xl:hidden"><div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-widest text-[#AAAE7F]"><Sparkles size={13} /> Your governance workspace</div><div className="grid gap-1">{visible.map(([href, label, Icon]) => <Link key={href} href={href} onClick={closeMenu} className={`flex min-h-11 items-center gap-3 rounded-xl px-4 py-3 text-sm ${pathname.startsWith(href) ? "bg-[#81559B]/18 text-[#D8D8F6]" : "text-[#D8D8F6]/55 hover:bg-[#AAAE7F]/8"}`}><Icon size={16} />{label}</Link>)}<Link href="/notifications" onClick={closeMenu} className={`flex min-h-11 items-center gap-3 rounded-xl px-4 py-3 text-sm ${pathname.startsWith("/notifications") ? "bg-[#7E3F8F]/18 text-[#D8D8F6]" : "text-[#D8D8F6]/55 hover:bg-[#AAAE7F]/8"}`}><Bell size={16} />Notifications{unread > 0 && <span className="ml-auto rounded-full bg-[#7E3F8F] px-2 py-0.5 text-[10px] font-bold text-white">{unread > 99 ? "99+" : unread}</span>}</Link></div><div className="mt-3 border-t border-[#D8D8F6]/10 pt-3"><p className="truncate text-sm text-[#D8D8F6]/90">Welcome, {firstName}</p><p className="mb-3 text-xs text-[#AAAE7F]/65">{role || "Your workspace"}</p><button type="button" className="btn btn-secondary min-h-11 w-full" onClick={logout} disabled={busy}><LogOut size={16} />{busy ? "Signing out..." : "Sign out"}</button>{error && <p className="mt-2 text-sm text-red-300">{error}</p>}</div></div>}
    </header>
    <nav className="mobile-bottom-nav xl:hidden" aria-label="Mobile navigation">{mobilePrimary.map(([href, label, Icon]) => <Link key={href} href={href} className={`mobile-bottom-nav-item ${pathname.startsWith(href) ? "is-active" : ""}`} aria-label={label}><Icon size={19} /><span>{label}</span></Link>)}<button type="button" className={`mobile-bottom-nav-item ${open ? "is-active" : ""}`} onClick={() => setOpen(!open)} aria-label="More navigation" aria-expanded={open}>{open ? <X size={19} /> : <Menu size={19} />}<span>More</span></button></nav>
  </>;
}
