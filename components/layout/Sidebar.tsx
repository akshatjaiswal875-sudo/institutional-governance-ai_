"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  BarChart3, Bell, Bot, CalendarDays, ClipboardList, FileText, LayoutDashboard,
  Menu, MessageSquare, Search, ShieldCheck, Users, PanelLeftClose, PanelLeftOpen,
  type LucideIcon,
} from "lucide-react";

export type SidebarItem = { href: string; label: string; icon: LucideIcon };
export type SidebarGroup = { label: string; items: SidebarItem[] };

export const sidebarGroups: SidebarGroup[] = [
  { label: "Overview", items: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/my-workspace", label: "My Workspace", icon: ClipboardList },
    { href: "/notifications", label: "Notifications", icon: Bell },
    { href: "/search", label: "Institutional Search", icon: Search },
  ]},
  { label: "Governance", items: [
    { href: "/meetings", label: "Meeting Management", icon: Users },
    { href: "/calendar", label: "Calendar", icon: CalendarDays },
  ]},
  { label: "Execution", items: [
    { href: "/events", label: "Institutional Events", icon: CalendarDays },
  ]},
  { label: "AI & Knowledge", items: [
    { href: "/policies", label: "Policies & Standards", icon: FileText },
    { href: "/assistant", label: "AI Governance Assistant", icon: Bot },
  ]},
  { label: "Communication", items: [
    { href: "/suggestions", label: "Suggestions", icon: MessageSquare },
  ]},
  { label: "Administration", items: [
    { href: "/users", label: "User Directory", icon: ShieldCheck },
  ]},
  { label: "Insights", items: [
    { href: "/reports", label: "Reports", icon: BarChart3 },
  ]},
];

export const sidebarItems = sidebarGroups.flatMap((group) => group.items);

type SidebarProps = { collapsed: boolean; onToggle: () => void; onNavigate?: () => void };

function isActivePath(pathname: string, href: string): boolean {
  return href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ collapsed, onToggle, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    for (const { href } of sidebarItems) router.prefetch(href);
  }, [router]);

  return (
    <aside className={`hidden h-[calc(100vh-72px)] shrink-0 border-r border-[var(--soft-border)] bg-white/90 backdrop-blur-xl transition-[width] duration-300 ease-out md:sticky md:top-[72px] md:block ${collapsed ? "w-[72px]" : "w-[264px]"}`} aria-label="Primary navigation">
      <div className="flex h-full flex-col p-3">
        <div className="mb-4 flex items-center justify-between gap-2">
          {!collapsed && <div className="px-2 pt-1"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted-text)]">Institutional Governance</p><p className="mt-1 text-xs text-[var(--body-text)]">Official workspace</p></div>}
          <button type="button" onClick={onToggle} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--soft-border)] bg-white text-[var(--heading)] shadow-sm transition hover:border-[var(--primary-main)] hover:text-[var(--primary-main)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-main)]/30" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} title={collapsed ? "Expand sidebar (Ctrl/Cmd+B)" : "Collapse sidebar (Ctrl/Cmd+B)"}>
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
        <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto" aria-label="Main navigation">
          {sidebarGroups.map((group) => <section key={group.label} aria-label={group.label}>
            {!collapsed && <h2 className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted-text)]">{group.label}</h2>}
            <div className="space-y-1">{group.items.map(({ href, label, icon: Icon }) => {
              const active = isActivePath(pathname, href);
              return <Link key={href} href={href} onClick={onNavigate} prefetch aria-current={active ? "page" : undefined} title={collapsed ? label : undefined} className={`group flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-semibold transition focus:outline-none focus:ring-2 focus:ring-[var(--primary-main)]/30 ${collapsed ? "justify-center" : ""} ${active ? "bg-blue-50 text-[var(--heading)] ring-1 ring-blue-200/80" : "text-[var(--body-text)] hover:bg-slate-100 hover:text-[var(--heading)]"}`}>
                <Icon size={18} strokeWidth={active ? 2.4 : 2} className={active ? "text-[#1E40AF]" : "text-[var(--muted-text)] group-hover:text-[#1E40AF]"} aria-hidden="true" />
                {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
                {!collapsed && active && <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary-main)]" aria-hidden="true" />}
              </Link>;
            })}</div>
          </section>)}
        </nav>
        <div className="mt-3 border-t border-[var(--soft-border)] pt-3">
          <div className={`rounded-xl bg-blue-50/70 p-3 ${collapsed ? "flex justify-center" : ""}`}>
            {collapsed ? <Menu size={18} className="text-[#1E40AF]" aria-hidden="true" /> : <><p className="text-xs font-semibold text-[var(--heading)]">Governance workspace</p><p className="mt-1 text-[11px] leading-5 text-[var(--muted-text)]">Role-based access is enforced by the server and database policies.</p></>}
          </div>
        </div>
      </div>
    </aside>
  );
}
