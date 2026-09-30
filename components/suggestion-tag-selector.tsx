'use client';

import { useEffect, useRef, useState } from 'react';

type Tag = { id: string; type: 'policy' | 'event'; customId: string; title: string; archived?: boolean };

type Props = { value: Tag[]; onChange: (tags: Tag[]) => void };

export function SuggestionTagSelector({ value, onChange }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Tag[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const search = (term: string) => {
    setQuery(term);
    if (timer.current) clearTimeout(timer.current);
    if (!term.trim()) { setResults([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}&types=policy,event&limit=5`);
        const json = await res.json() as { data?: Tag[] };
        setResults((json.data ?? []).slice(0, 8));
        setOpen(true);
      } finally { setBusy(false); }
    }, 250);
  };

  const add = (tag: Tag) => {
    if (value.some((v) => v.id === tag.id && v.type === tag.type) || value.length >= 10) return;
    onChange([...value, tag]); setQuery(''); setResults([]); setOpen(false);
  };

  return <div className="space-y-2">
    <div className="flex flex-wrap gap-2">
      {value.map((tag) => <button type="button" key={`${tag.type}:${tag.id}`} onClick={() => onChange(value.filter((v) => !(v.id === tag.id && v.type === tag.type)))} className="rounded-full border px-2.5 py-1 text-xs" title={tag.title} aria-label={`Remove ${tag.customId}`}>
        {tag.customId} ×
      </button>)}
    </div>
    <div className="relative">
      <input value={query} onChange={(e) => search(e.target.value)} onFocus={() => results.length > 0 && setOpen(true)} placeholder="Tag policy/event by @ID or title" className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" aria-label="Search policies and events to tag" />
      {open && <div role="listbox" className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg border bg-popover p-1 shadow-lg">
        {busy && <div className="p-3 text-sm text-muted-foreground">Searching…</div>}
        {!busy && results.length === 0 && <div className="p-3 text-sm text-muted-foreground">No matching policies or events</div>}
        {results.map((tag) => <button type="button" role="option" key={`${tag.type}:${tag.id}`} disabled={tag.archived} onClick={() => add(tag)} className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">
          <span className="font-semibold">{tag.customId}</span><span className="ml-2">{tag.title}</span>
        </button>)}
      </div>}
    </div>
    <p className="text-xs text-muted-foreground">Up to 10 tags. Select a result or type @ followed by an ID/title.</p>
  </div>;
}
