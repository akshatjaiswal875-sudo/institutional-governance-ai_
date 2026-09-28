"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, ExternalLink, Play } from "lucide-react";
import { Badge, Card } from "@/components/ui";

export function SearchView() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);

  async function search() {
    const value = query.trim();
    if (!value) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(value)}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Search failed");
      setResults(result.data ?? []);
    } catch (e) {
      setResults([]);
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  async function playRecording(result: any) {
    const meetingId = result.metadata?.meeting_id;
    const recordingId = result.parent_id;
    if (!meetingId || !recordingId) {
      setError("This recording does not have enough information to open it.");
      return;
    }

    setOpeningId(recordingId);
    setError("");
    try {
      const response = await fetch(`/api/meetings/${meetingId}/recordings?recordingId=${encodeURIComponent(recordingId)}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to open recording");
      if (!body.data?.url) throw new Error("Recording URL was not returned");
      window.open(body.data.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to open recording");
    } finally {
      setOpeningId(null);
    }
  }

  function resultTitle(result: any) {
    if (result.parent_type === "meeting_recording") return result.metadata?.filename || "Recording";
    if (result.parent_type === "meeting") return result.metadata?.title || "Meeting";
    return result.parent_type?.replaceAll("_", " ") || "Record";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Search</h1>
        <p className="mt-2 text-slate-400">Search permitted records.</p>
      </div>

      <Card>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void search();
          }}
          className="flex gap-3"
        >
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-3 text-slate-500" />
            <input
              className="input pl-9"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search meetings, recordings, transcripts, decisions..."
            />
          </div>
          <button className="btn btn-primary" disabled={loading || !query.trim()}>
            {loading ? "Searching..." : "Search"}
          </button>
        </form>
      </Card>

      {error && <p className="text-red-400" role="alert">{error}</p>}

      <div className="space-y-4">
        {results.map((result, index) => {
          const key = `${result.parent_type}-${result.parent_id}-${index}`;
          const meetingId = result.metadata?.meeting_id || (result.parent_type === "meeting" ? result.parent_id : null);
          const isRecording = result.parent_type === "meeting_recording";

          return (
            <Card key={key}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <Badge>{result.parent_type}</Badge>
                  <h2 className="mt-3 text-lg font-medium break-words">{resultTitle(result)}</h2>
                  <p className="mt-2 whitespace-pre-wrap break-words text-slate-400">{result.chunk_content}</p>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  {isRecording && (
                    <button
                      className="btn btn-primary"
                      onClick={() => void playRecording(result)}
                      disabled={openingId === result.parent_id}
                    >
                      <Play size={15} />
                      {openingId === result.parent_id ? "Opening..." : "Play recording"}
                    </button>
                  )}
                  {meetingId && (
                    <Link className="btn btn-secondary" href={`/meetings/${meetingId}`}>
                      <ExternalLink size={15} />
                      Open meeting
                    </Link>
                  )}
                </div>
              </div>
            </Card>
          );
        })}

        {!loading && query.trim() && !error && results.length === 0 && (
          <p className="text-slate-400">No permitted records found.</p>
        )}
      </div>
    </div>
  );
}
