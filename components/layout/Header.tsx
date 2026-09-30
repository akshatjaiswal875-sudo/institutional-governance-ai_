"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Bell,
  Bot,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeft,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type SearchResult = {
  parent_type: string;
  parent_id: string;
  chunk_content: string;
  metadata: Record<string, unknown>;
  similarity: number;
};

type HeaderProps = {
  email: string;
  role: string | null;
  unread: number;
  sidebarCollapsed: boolean;
  onSidebarToggle: () => void;
  onMobileOpen: () => void;
};

const resultTypeLabels: Record<string, string> = {
  policy: "Policy",
  meeting: "Meeting",
  event: "Event",
};

function isSearchResult(value: unknown): value is SearchResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.parent_type === "string" &&
    typeof candidate.parent_id === "string" &&
    typeof candidate.chunk_content === "string" &&
    typeof candidate.similarity === "number"
  );
}

function metadataTitle(result: SearchResult): string {
  const title = result.metadata.title;
  return typeof title === "string" && title.trim() ? title : result.chunk_content.split("\n")[0] || "Record";
}

function resultHref(result: SearchResult): string {
  if (result.parent_type === "policy") return `/policies/${result.parent_id}`;
  if (result.parent_type === "meeting") return `/meetings/${result.parent_id}`;
  if (result.parent_type === "event") return `/events/${result.parent_id}`;
  return "/search";
}

export function Header({
  email,
  role,
  unread,
  sidebarCollapsed,
  onSidebarToggle,
  onMobileOpen,
}: HeaderProps) {
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "policy" | "meeting" | "event">("all");
  const [activeResult, setActiveResult] = useState(0);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [assistantMessage, setAssistantMessage] = useState("");

  useEffect(() => {
    function focusSearch() {
      searchRef.current?.focus();
      setSearchOpen(true);
    }
    window.addEventListener("govai:focus-search", focusSearch);
    return () => window.removeEventListener("govai:focus-search", focusSearch);
  }, []);

  useEffect(() => {
    const value = query.trim();
    if (!value) {
      setResults([]);
      setSearchError("");
      setSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchLoading(true);
      setSearchError("");
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(value)}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        const body: unknown = await response.json();
        if (!response.ok) {
          throw new Error("Search is temporarily unavailable.");
        }
        const data =
          body && typeof body === "object" && "data" in body && Array.isArray((body as { data?: unknown }).data)
            ? (body as { data: unknown[] }).data
            : [];
        setResults(data.filter(isSearchResult).slice(0, 20));
        setActiveResult(0);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setResults([]);
        setSearchError(error instanceof Error ? error.message : "Search failed.");
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const visibleResults = results.filter((result) => filter === "all" || result.parent_type === filter);

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setSearchOpen(false);
      searchRef.current?.blur();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveResult((current) => Math.min(current + 1, Math.max(visibleResults.length - 1, 0)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveResult((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const result = visibleResults[activeResult];
      if (result) {
        setSearchOpen(false);
        router.push(resultHref(result));
      } else if (query.trim()) {
        router.push(`/search?q=${encodeURIComponent(query.trim())}`);
        setSearchOpen(false);
      }
    }
  }

  async function logout() {
    if (logoutBusy) return;
    setLogoutBusy(true);
    const { error } = await createClient().auth.signOut();
    if (!error) {
      router.replace("/login");
      router.refresh();
    } else {
      setLogoutBusy(false);
    }
  }

  function submitAssistant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = assistantMessage.trim();
    if (!value) return;
    setAssistantMessage("");
    router.push(`/assistant?q=${encodeURIComponent(value)}`);
    setAssistantOpen(false);
  }

  const firstName = email ? email.split("@")[0].split(/[._-]/)[0] : "User";

  return (
    <header className="sticky top-0 z-[60] border-b border-[var(--soft-border)] bg-white/85 backdrop-blur-2xl">
      <div className="mx-auto flex h-[72px] w-full items-center gap-2 px-3 sm:gap-3 sm:px-5 lg:px-6">
        <button
          type="button"
          className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--soft-border)] bg-white text-[var(--heading)] shadow-sm transition hover:border-violet-200 hover:text-[var(--primary-main)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-main)]/30 md:flex"
          onClick={onSidebarToggle}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!sidebarCollapsed}
          title="Toggle sidebar (Ctrl/Cmd+B)"
        >
          <PanelLeft size={18} />
        </button>

        <Link href="/dashboard" className="group flex shrink-0 items-center gap-2" aria-label="GovAI dashboard">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-cyan-500 text-white shadow-lg shadow-violet-200/60 transition group-hover:-translate-y-0.5">
            <ShieldCheck size={20} />
          </span>
          <span className="hidden sm:block">
            <span className="block text-sm font-extrabold tracking-tight text-[var(--heading)]">Gov<span className="text-[var(--primary-main)]">AI</span></span>
            <span className="block text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--muted-text)]">Governance OS</span>
          </span>
        </Link>

        <button
          type="button"
          onClick={onMobileOpen}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--soft-border)] bg-white text-[var(--heading)] md:hidden"
          aria-label="Open navigation"
        >
          <Menu size={19} />
        </button>

        <div className="relative min-w-0 flex-1">
          <div className={`flex h-11 items-center gap-2 rounded-xl border bg-white/90 px-3 shadow-sm transition focus-within:border-violet-300 focus-within:ring-4 focus-within:ring-violet-100 ${searchOpen ? "border-violet-300" : "border-[var(--soft-border)]"}`}>
            <Search size={18} className="shrink-0 text-[var(--muted-text)]" aria-hidden="true" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={handleSearchKeyDown}
              className="min-w-0 flex-1 bg-transparent text-sm text-[var(--heading)] outline-none placeholder:text-[var(--muted-text)]"
              placeholder="Search meetings, events, policies..."
              aria-label="Global search"
              aria-expanded={searchOpen}
              aria-controls="global-search-results"
              aria-autocomplete="list"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} className="rounded-lg p-1.5 text-[var(--muted-text)] hover:bg-violet-50 hover:text-[var(--heading)]" aria-label="Clear search">
                <X size={15} />
              </button>
            )}
            <kbd className="hidden rounded-md border border-[var(--soft-border)] bg-[var(--surface-soft)] px-2 py-1 text-[10px] font-semibold text-[var(--muted-text)] lg:inline-flex">⌘K</kbd>
          </div>

          {searchOpen && (query.trim() || searchLoading || searchError) && (
            <div id="global-search-results" className="absolute left-0 right-0 top-[calc(100%+8px)] z-[80] overflow-hidden rounded-2xl border border-[var(--soft-border)] bg-white/98 shadow-2xl shadow-slate-300/30 backdrop-blur-xl" role="listbox" aria-label="Global search results">
              <div className="flex items-center gap-1 border-b border-[var(--soft-border)] p-2">
                {(["all", "policy", "meeting", "event"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFilter(type)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${filter === type ? "bg-violet-100 text-violet-700" : "text-[var(--muted-text)] hover:bg-violet-50"}`}
                  >
                    {type === "all" ? "All" : resultTypeLabels[type]}
                  </button>
                ))}
              </div>
              <div className="max-h-[min(55vh,420px)] overflow-y-auto p-2">
                {searchLoading && <div className="p-4 text-sm text-[var(--muted-text)]">Searching permitted records...</div>}
                {!searchLoading && searchError && <div className="p-4 text-sm text-rose-600" role="alert">{searchError}</div>}
                {!searchLoading && !searchError && visibleResults.map((result, index) => (
                  <button
                    key={`${result.parent_type}-${result.parent_id}`}
                    type="button"
                    role="option"
                    aria-selected={index === activeResult}
                    onMouseEnter={() => setActiveResult(index)}
                    onClick={() => {
                      setSearchOpen(false);
                      router.push(resultHref(result));
                    }}
                    className={`flex w-full items-start gap-3 rounded-xl p-3 text-left transition ${index === activeResult ? "bg-violet-50" : "hover:bg-slate-50"}`}
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-100 to-cyan-50 text-violet-700">
                      {result.parent_type === "policy" ? <FileIcon /> : result.parent_type === "meeting" ? <CalendarIcon /> : <EventIcon />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-[var(--heading)]">{metadataTitle(result)}</span>
                      <span className="mt-0.5 block text-[11px] uppercase tracking-wide text-[var(--muted-text)]">{resultTypeLabels[result.parent_type] ?? result.parent_type}</span>
                    </span>
                  </button>
                ))}
                {!searchLoading && !searchError && query.trim() && visibleResults.length === 0 && (
                  <div className="p-5 text-center text-sm text-[var(--muted-text)]">No permitted records found.</div>
                )}
              </div>
              <div className="flex items-center justify-between border-t border-[var(--soft-border)] px-3 py-2 text-[11px] text-[var(--muted-text)]">
                <span>↑ ↓ navigate · Enter open · Esc close</span>
                <Link href={`/search?q=${encodeURIComponent(query.trim())}`} onClick={() => setSearchOpen(false)} className="font-semibold text-violet-700 hover:underline">View all results</Link>
              </div>
            </div>
          )}
        </div>

        <div className="hidden items-center gap-1.5 lg:flex">
          <Link href="/dashboard" className="btn btn-secondary h-10 px-3" title="Dashboard">
            <LayoutDashboard size={16} />
            <span className="hidden xl:inline">Dashboard</span>
          </Link>
          <button type="button" onClick={() => setAssistantOpen(true)} className="btn btn-primary h-10 px-3" title="AI Assistant">
            <Bot size={16} />
            <span className="hidden xl:inline">AI Assistant</span>
          </button>
          <Link href="/notifications" className="relative flex h-10 w-10 items-center justify-center rounded-xl text-[var(--body-text)] hover:bg-violet-50" aria-label="Notifications">
            <Bell size={18} />
            {unread > 0 && <span className="absolute right-0 top-0 min-w-4 rounded-full bg-rose-500 px-1 text-center text-[9px] font-bold leading-4 text-white">{unread > 99 ? "99+" : unread}</span>}
          </Link>
          <div className="relative ml-1 border-l border-[var(--soft-border)] pl-2">
            <button type="button" onClick={() => setProfileOpen((open) => !open)} className="flex h-10 items-center gap-2 rounded-xl px-2 hover:bg-violet-50" aria-expanded={profileOpen} aria-haspopup="menu">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 text-xs font-bold text-white">{(email[0] || "U").toUpperCase()}</span>
              <span className="hidden max-w-[130px] text-left xl:block"><span className="block truncate text-xs font-semibold text-[var(--heading)]">{firstName}</span><span className="block truncate text-[10px] uppercase tracking-wider text-[var(--muted-text)]">{role || "Member"}</span></span>
              <ChevronDown size={14} className="text-[var(--muted-text)]" />
            </button>
            {profileOpen && (
              <div className="absolute right-0 top-[calc(100%+8px)] w-56 rounded-2xl border border-[var(--soft-border)] bg-white p-2 shadow-2xl" role="menu">
                <div className="border-b border-[var(--soft-border)] px-3 py-2"><p className="truncate text-sm font-semibold text-[var(--heading)]">{email || "Signed in"}</p><p className="mt-0.5 text-xs text-[var(--muted-text)]">{role || "Member"}</p></div>
                <button type="button" onClick={() => void logout()} disabled={logoutBusy} className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50" role="menuitem"><LogOut size={16} />{logoutBusy ? "Signing out..." : "Sign out"}</button>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 lg:hidden">
          <button type="button" onClick={() => setAssistantOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700" aria-label="Open AI Assistant"><Bot size={18} /></button>
          <Link href="/notifications" className="relative flex h-10 w-10 items-center justify-center rounded-xl text-[var(--body-text)]" aria-label="Notifications"><Bell size={18} />{unread > 0 && <span className="absolute right-0 top-0 min-w-4 rounded-full bg-rose-500 px-1 text-center text-[9px] font-bold leading-4 text-white">{unread > 99 ? "99+" : unread}</span>}</Link>
        </div>
      </div>

      {assistantOpen && (
        <div className="fixed inset-0 z-[90]" role="presentation">
          <button type="button" className="absolute inset-0 bg-slate-950/30 backdrop-blur-sm" onClick={() => setAssistantOpen(false)} aria-label="Close AI Assistant" />
          <aside className="absolute right-0 top-0 flex h-full w-[min(92vw,440px)] flex-col border-l border-[var(--soft-border)] bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label="AI Assistant">
            <div className="flex items-center justify-between border-b border-[var(--soft-border)] p-4">
              <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-cyan-500 text-white"><Sparkles size={18} /></span><div><p className="font-bold text-[var(--heading)]">Governance AI</p><p className="text-xs text-[var(--muted-text)]">Meetings, policies and events</p></div></div>
              <button type="button" onClick={() => setAssistantOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--soft-border)]" aria-label="Close AI Assistant"><X size={18} /></button>
            </div>
            <div className="flex-1 p-5"><div className="rounded-2xl bg-gradient-to-br from-violet-50 to-cyan-50 p-4"><p className="text-sm font-semibold text-[var(--heading)]">AI Assistant panel is ready.</p><p className="mt-1 text-sm leading-6 text-[var(--body-text)]">Ask about institutional meetings, policies or events. The full conversational experience remains on the existing assistant route.</p></div></div>
            <form onSubmit={submitAssistant} className="border-t border-[var(--soft-border)] p-4"><div className="flex items-center gap-2 rounded-xl border border-[var(--soft-border)] bg-white p-2"><input value={assistantMessage} onChange={(event) => setAssistantMessage(event.target.value)} className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm outline-none" placeholder="Ask Governance AI..." aria-label="Ask Governance AI" /><button type="submit" className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-cyan-500 text-white" aria-label="Send to AI Assistant"><Send size={17} /></button></div><Link href="/assistant" onClick={() => setAssistantOpen(false)} className="mt-2 block text-center text-xs font-semibold text-violet-700 hover:underline">Open full AI Assistant</Link></form>
          </aside>
        </div>
      )}
    </header>
  );
}

function FileIcon() { return <span aria-hidden="true">▤</span>; }
function CalendarIcon() { return <span aria-hidden="true">◫</span>; }
function EventIcon() { return <span aria-hidden="true">◈</span>; }
