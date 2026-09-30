'use client';

import { useEffect, useRef, useState } from 'react';

type Tag = {
  id: string;
  type: 'policy' | 'event';
  customId: string;
  title: string;
  archived?: boolean;
};

type SearchResponse = {
  data?: Array<{
    parent_type: string;
    parent_id: string;
    chunk_content: string;
    metadata?: { title?: string; customId?: string | null; status?: string | null };
  }>;
  error?: string;
};

type Props = {
  value: Tag[];
  onChange: (tags: Tag[]) => void;
};

function normalizeQuery(value: string): string {
  return value.replace(/^@/, '').trim();
}

export function SuggestionTagSelector({ value, onChange }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Tag[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    requestRef.current?.abort();
  }, []);

  const search = (raw: string) => {
    setQuery(raw);
    setError('');
    setActiveIndex(0);
    if (timer.current) clearTimeout(timer.current);
    requestRef.current?.abort();

    const term = normalizeQuery(raw);
    if (!term) {
      setResults([]);
      setOpen(false);
      return;
    }

    timer.current = setTimeout(async () => {
      const controller = new AbortController();
      requestRef.current = controller;
      setBusy(true);
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(term)}&types=policy,event&limit=5`,
          { signal: controller.signal, cache: 'no-store' },
        );
        const json = (await res.json()) as SearchResponse;
        if (!res.ok) throw new Error(json.error ?? 'Search failed.');

        const mapped = (json.data ?? [])
          .filter((item) => item.parent_type === 'policy' || item.parent_type === 'event')
          .slice(0, 8)
          .map((item): Tag => ({
            id: item.parent_id,
            type: item.parent_type as 'policy' | 'event',
            customId: item.metadata?.customId ?? `${item.parent_type.toUpperCase()}-${item.parent_id.slice(0, 6)}`,
            title: item.metadata?.title ?? item.chunk_content,
            archived: item.metadata?.status === 'ARCHIVED',
          }));

        setResults(mapped);
        setOpen(true);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setResults([]);
        setOpen(true);
        setError(err instanceof Error ? err.message : 'Unable to search.');
      } finally {
        setBusy(false);
      }
    }, 250);
  };

  const add = (tag: Tag) => {
    if (tag.archived || value.length >= 10) return;
    if (value.some((item) => item.id === tag.id && item.type === tag.type)) return;
    onChange([...value, tag]);
    setQuery('');
    setResults([]);
    setOpen(false);
    setActiveIndex(0);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!open || results.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + results.length) % results.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const selected = results[activeIndex];
      if (selected) add(selected);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="suggestion-tags" className="mb-2 block text-sm font-medium">
          Link policies or events <span className="text-slate-500">(optional)</span>
        </label>
        <div className="flex flex-wrap gap-2" aria-live="polite">
          {value.map((tag) => (
            <button
              type="button"
              key={`${tag.type}:${tag.id}`}
              onClick={() => onChange(value.filter((item) => !(item.id === tag.id && item.type === tag.type)))}
              className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-800 hover:bg-indigo-100"
              title={tag.title}
              aria-label={`Remove ${tag.customId}`}
            >
              {tag.customId} ×
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        <input
          id="suggestion-tags"
          value={query}
          onChange={(event) => search(event.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={value.length >= 10 ? 'Maximum 10 tags selected' : 'Type @PC-0004, @EV-0012 or a title'}
          disabled={value.length >= 10}
          className="input w-full"
          aria-label="Search policies and events to tag"
          aria-expanded={open}
          aria-controls="suggestion-tag-results"
          autoComplete="off"
        />

        {open && (
          <div id="suggestion-tag-results" role="listbox" className="absolute z-30 mt-2 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
            {busy && <div className="p-3 text-sm text-slate-500">Searching…</div>}
            {!busy && error && <div className="p-3 text-sm text-red-600">{error}</div>}
            {!busy && !error && results.length === 0 && <div className="p-3 text-sm text-slate-500">No matching policies or events.</div>}
            {!busy && !error && results.map((tag, index) => (
              <button
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                key={`${tag.type}:${tag.id}`}
                disabled={tag.archived}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => add(tag)}
                className={`block w-full rounded-lg px-3 py-2.5 text-left text-sm ${index === activeIndex ? 'bg-slate-100' : 'hover:bg-slate-50'} disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <span className="font-semibold text-indigo-700">{tag.customId}</span>
                <span className="ml-2 text-slate-700">{tag.title}</span>
                {tag.archived && <span className="ml-2 text-xs text-slate-400">Archived</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="text-xs text-slate-500">Up to 10 tags. Use @ for quick search, or search by ID/title and press Enter.</p>
    </div>
  );
}
