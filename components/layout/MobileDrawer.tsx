"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { sidebarGroups } from "./Sidebar";
import Link from "next/link";
import { usePathname } from "next/navigation";

type MobileDrawerProps = { open: boolean; onClose: () => void };

function isActivePath(pathname: string, href: string): boolean {
  return href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileDrawer({ open, onClose }: MobileDrawerProps) {
  const pathname = usePathname();
  const drawerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(drawerRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []);
    focusable()[0]?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab") return;
      const elements = focusable();
      if (!elements.length) return;
      if (event.shiftKey && document.activeElement === elements[0]) { event.preventDefault(); elements[elements.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === elements[elements.length - 1]) { event.preventDefault(); elements[0].focus(); }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", handleKeyDown); };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] md:hidden" role="presentation">
      <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-slate-950/30 backdrop-blur-sm" onClick={onClose} />
      <aside ref={drawerRef} role="dialog" aria-modal="true" aria-label="Mobile navigation" className="relative flex h-full w-[min(88vw,360px)] flex-col border-r border-[var(--soft-border)] bg-white p-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--soft-border)] pb-4">
          <div><p className="text-lg font-bold tracking-tight text-[var(--heading)]">GovAI</p><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted-text)]">Institutional Governance OS</p></div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--soft-border)] bg-white text-[var(--heading)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-main)]/30" aria-label="Close navigation drawer"><X size={19} /></button>
        </div>
        <nav className="mt-4 flex-1 space-y-4 overflow-y-auto" aria-label="Mobile primary navigation">
          {sidebarGroups.map((group) => <section key={group.label} aria-label={group.label}>
            <h2 className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted-text)]">{group.label}</h2>
            <div className="space-y-1">{group.items.map(({ href, label, icon: Icon }) => {
              const active = isActivePath(pathname, href);
              return <Link key={href} href={href} onClick={onClose} aria-current={active ? "page" : undefined} className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--primary-main)]/30 ${active ? "bg-blue-50 text-[var(--heading)] ring-1 ring-blue-200/80" : "text-[var(--body-text)] hover:bg-blue-50/70"}`}>
                <Icon size={18} className={active ? "text-[var(--primary-main)]" : "text-[var(--muted-text)]"} aria-hidden="true" /><span>{label}</span>
              </Link>;
            })}</div>
          </section>)}
        </nav>
        <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-xs leading-5 text-[var(--muted-text)]">Your permissions are checked by GovAI before protected actions are allowed.</div>
      </aside>
    </div>
  );
}
