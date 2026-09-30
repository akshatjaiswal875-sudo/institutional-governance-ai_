"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  CalendarDays,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Menu,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from "lucide-react";

export type SidebarItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const sidebarItems: SidebarItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/meetings", label: "Meetings", icon: CalendarDays },
  { href: "/events", label: "Events", icon: CalendarDays },
  { href: "/policies", label: "Policies", icon: FileText },
  { href: "/suggestions", label: "Suggestions", icon: MessageSquare },
  { href: "/my-workspace", label: "My Workspace", icon: ClipboardList },
];

type SidebarProps = {
  collapsed: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
};

function isActivePath(pathname: string, href: string): boolean {
  return href === "/dashboard"
    ? pathname === "/dashboard"
    : pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ collapsed, onToggle, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    for (const { href } of sidebarItems) router.prefetch(href);
  }, [router]);

  return (
    <aside
      className={`hidden h-[calc(100vh-72px)] shrink-0 border-r border-[var(--soft-border)] bg-white/75 backdrop-blur-2xl transition-[width] duration-300 ease-out md:sticky md:top-[72px] md:block ${collapsed ? "w-[72px]" : "w-[256px]"}`}
      aria-label="Primary navigation"
    >
      <div className="flex h-full flex-col p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          {!collapsed && (
            <div className="px-2 pt-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted-text)]">Governance OS</p>
              <p className="mt-1 text-xs text-[var(--body-text)]">Institutional workspace</p>
            </div>
          )}
          <button type="button" onClick={onToggle} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--soft-border)] bg-white/80 text-[var(--heading)] shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--primary-main)] hover:text-[var(--primary-main)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-main)]/30" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} title={collapsed ? "Expand sidebar (Ctrl/Cmd+B)" : "Collapse sidebar (Ctrl/Cmd+B)"}>
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto" aria-label="Main navigation">
          {sidebarItems.map(({ href, label, icon: Icon }) => {
            const active = isActivePath(pathname, href);
            return (
              <Link key={href} href={href} onClick={onNavigate} prefetch aria-current={active ? "page" : undefined} title={collapsed ? label : undefined} className={`group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-[var(--primary-main)]/30 ${collapsed ? "justify-center" : ""} ${active ? "bg-gradient-to-r from-violet-100/90 to-cyan-50/90 text-[var(--heading)] shadow-sm ring-1 ring-violet-200/70" : "text-[var(--body-text)] hover:bg-violet-50/70 hover:text-[var(--heading)]"}`}>
                <Icon size={19} strokeWidth={active ? 2.4 : 2} className={active ? "text-[var(--primary-main)]" : "text-[var(--muted-text)] group-hover:text-[var(--primary-main)]"} aria-hidden="true" />
                {!collapsed && <span className="truncate">{label}</span>}
                {!collapsed && active && <span className="ml-auto h-2 w-2 rounded-full bg-[var(--primary-main)]" aria-hidden="true" />}
              </Link>
            );
          })}
        </nav>

        <div className="mt-3 border-t border-[var(--soft-border)] pt-3">
          <div className={`rounded-xl bg-gradient-to-br from-violet-50 to-cyan-50 p-3 ${collapsed ? "flex justify-center" : ""}`}>
            {collapsed ? <Menu size={18} className="text-[var(--primary-main)]" aria-hidden="true" /> : <><p className="text-xs font-semibold text-[var(--heading)]">Quick navigation</p><p className="mt-1 text-[11px] leading-5 text-[var(--muted-text)]">Ctrl/Cmd+B toggles this sidebar.</p></>}
          </div>
        </div>
      </div>
    </aside>
  );
}
