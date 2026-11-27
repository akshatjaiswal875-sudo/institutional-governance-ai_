"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, CheckCircle2, Clock3, Link2, MapPin, Video, UserPlus, X } from "lucide-react";

type ParticipantOption = { id: string; email: string };

async function createMeeting(body: unknown) {
  const response = await fetch("/api/meetings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Unable to create meeting.");
  return result.data;
}

export function OnlineMeetingForm() {
  const [type, setType] = useState<"offline" | "online">("offline");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<any>(null);
  const [participantOptions, setParticipantOptions] = useState<ParticipantOption[]>([]);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);
  const [participantQuery, setParticipantQuery] = useState("");
  const [participantsLoading, setParticipantsLoading] = useState(true);
  const [participantsError, setParticipantsError] = useState("");
  const [participantsAdded, setParticipantsAdded] = useState(0);
  const [creationNotice, setCreationNotice] = useState("");
  const [invitationResults, setInvitationResults] = useState<Array<{ email: string; sent: boolean; error?: string }>>([]);

  useEffect(() => {
    let active = true;
    async function loadParticipants() {
      setParticipantsLoading(true);
      setParticipantsError("");
      try {
        const response = await fetch("/api/meetings/participant-options", { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Unable to load participant list.");
        if (active) setParticipantOptions(result.data ?? []);
      } catch (value) {
        if (active) setParticipantsError(value instanceof Error ? value.message : "Unable to load participant list.");
      } finally {
        if (active) setParticipantsLoading(false);
      }
    }
    void loadParticipants();
    return () => { active = false; };
  }, []);

  const availableParticipants = useMemo(() => {
    const query = participantQuery.trim().toLowerCase();
    return participantOptions.filter(option =>
      !selectedParticipantIds.includes(option.id)
      && option.email.toLowerCase().includes(query)
    );
  }, [participantOptions, participantQuery, selectedParticipantIds]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    const date = String(form.get("date") ?? "");
    const time = String(form.get("time") ?? "09:00");
    const conferenceUrl = String(form.get("conference_url") ?? "").trim();
    if (!title || !date || !time) {
      setError("Title, date and time are required.");
      return;
    }

    setSaving(true);
    setError("");
    setCreationNotice("");
    try {
      const data = await createMeeting({
        title,
        date: `${date}T${time}:00+05:30`,
        location: type === "online" ? "Online" : String(form.get("location") ?? ""),
        type,
        conference_url: type === "online" ? conferenceUrl : undefined,
      });
      setCreated(data);

      let added = 0;
      const results: Array<{ email: string; sent: boolean; error?: string }> = [];
      for (const userId of selectedParticipantIds) {
        const participantEmail = participantOptions.find(option => option.id === userId)?.email ?? userId;
        try {
          const response = await fetch(`/api/meetings/${data.id}/participants`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, attendanceStatus: "Invited" }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error ?? "Unable to add participant.");
          added += 1;

          const invitationResponse = await fetch(`/api/meetings/${data.id}/participants/invite`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ participantId: result.data.id }),
          });
          const invitationResult = await invitationResponse.json();
          if (!invitationResponse.ok || invitationResult.data?.sent !== true) {
            throw new Error(invitationResult.error ?? "Participant was added, but the invitation email could not be sent.");
          }
          results.push({ email: participantEmail, sent: true });
        } catch (value) {
          results.push({
            email: participantEmail,
            sent: false,
            error: value instanceof Error ? value.message : "Unable to add participant or send invitation.",
          });
        }
      }
      setParticipantsAdded(added);
      setInvitationResults(results);
      const sent = results.filter(result => result.sent).length;
      const failed = results.length - sent;
      setCreationNotice(
        selectedParticipantIds.length === 0
          ? "Meeting saved as a draft. No participants were selected."
          : failed === 0
            ? `Meeting saved and all ${sent} participant invitation${sent === 1 ? "" : "s"} sent successfully.`
            : `Meeting saved. ${sent} invitation${sent === 1 ? "" : "s"} sent; ${failed} failed. Open the meeting page to retry failed invitations.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create meeting.");
    } finally {
      setSaving(false);
    }
  }

  if (created) {
    const online = created.type === "online" && created.conference_url;
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-3xl font-semibold">Meeting created</h1>
          <p className="mt-2 text-slate-600">Your meeting has been saved and participant invitations have been processed.</p>
        </div>
        <section className="rounded-2xl border border-[#b8c3a4] bg-white/80 p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 text-[#315247]" size={24} />
            <div>
              <h2 className="text-xl font-semibold text-[#18251f]">{created.title}</h2>
              <p className="mt-1 text-sm text-slate-600">{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(created.date))}</p>
            </div>
          </div>
          {creationNotice && <p className={invitationResults.some(result => !result.sent) ? "mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" : "mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"} role="status">{creationNotice}</p>}
          {invitationResults.length > 0 && (
            <div className="mt-4 rounded-xl border border-[#d6ddcf] bg-white p-4">
              <h3 className="font-semibold text-[#26342e]">Invitation delivery</h3>
              <ul className="mt-3 space-y-2 text-sm">
                {invitationResults.map(result => (
                  <li key={result.email} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <span className="break-all text-slate-700">{result.email}</span>
                    <span className={result.sent ? "text-emerald-700" : "text-red-700"}>{result.sent ? "Email sent" : `Failed: ${result.error ?? "Please retry from the meeting page."}`}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {online ? (
            <div className="mt-6 rounded-xl border border-[#b8c3a4] bg-[#f3f5ea] p-5">
              <div className="flex items-center gap-2 font-semibold text-[#18251f]"><Video size={18} /> Online meeting link</div>
              <p className="mt-2 text-sm text-slate-600">The meeting link is available on the meeting record and can be included in participant invitations.</p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#c6cfb8] bg-white px-3 py-2 text-sm text-slate-700">
                  <Link2 size={16} className="shrink-0" />
                  <span className="truncate">{created.conference_url}</span>
                </div>
                <a className="btn btn-primary shrink-0" href={created.conference_url} target="_blank" rel="noreferrer">Join meeting</a>
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-[#d1d4c6] bg-[#f7f7f1] p-5 text-slate-700">
              <div className="flex items-center gap-2 font-semibold"><MapPin size={18} /> Offline meeting</div>
              <p className="mt-2 text-sm">{created.location || "Location not specified"}</p>
            </div>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={`/meetings/${created.id}`} className="btn btn-secondary">{invitationResults.some(result => !result.sent) ? "View meeting and retry failed invitations" : "View meeting"}</Link>
            <Link href="/meetings/new" className="btn btn-primary">Create another</Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">New meeting</h1>
        <p className="mt-2 text-slate-600">Create a governed meeting record and add the people who should attend.</p>
      </div>
      <section className="rounded-2xl border border-[#b8c3a4] bg-white/75 p-6 shadow-sm">
        <form onSubmit={submit} className="space-y-5">
          <label className="block text-sm font-medium text-[#26342e]">Title<input name="title" className="input mt-2" required placeholder="e.g. Faculty Review Meeting" /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-[#26342e]">Date<div className="relative mt-2"><CalendarDays size={17} className="pointer-events-none absolute left-3 top-3 text-slate-500" /><input name="date" className="input pl-10" type="date" required /></div></label>
            <label className="block text-sm font-medium text-[#26342e]">Time<div className="relative mt-2"><Clock3 size={17} className="pointer-events-none absolute left-3 top-3 text-slate-500" /><input name="time" className="input pl-10" type="time" required /></div></label>
          </div>
          <label className="block text-sm font-medium text-[#26342e]">Location<input name="location" className="input mt-2" placeholder={type === "online" ? "Online meeting" : "Room / venue"} disabled={type === "online"} /></label>
          <label className="block text-sm font-medium text-[#26342e]">Meeting type<select name="type" className="select mt-2" value={type} onChange={(event) => setType(event.target.value as "offline" | "online")}><option value="offline">Offline</option><option value="online">Online</option></select></label>

          <div className="rounded-xl border border-[#d6ddcf] bg-[#fbfcf9] p-4">
            <div className="flex items-center gap-2 font-semibold text-[#26342e]"><UserPlus size={17} /> Participants <span className="text-xs font-normal text-slate-500">(optional)</span></div>
            <p className="mt-1 text-sm text-slate-600">Select the faculty members, coordinators or other users who should be added to this meeting.</p>
            <input
              className="input mt-3 bg-white"
              value={participantQuery}
              onChange={event => setParticipantQuery(event.target.value)}
              placeholder="Search by institutional email"
              aria-label="Search participants"
            />
            <select
              className="select mt-2 bg-white"
              value=""
              onChange={event => {
                const id = event.target.value;
                if (id) setSelectedParticipantIds(current => [...current, id]);
              }}
              disabled={participantsLoading || availableParticipants.length === 0}
              aria-label="Choose a participant"
            >
              <option value="">{participantsLoading ? "Loading users..." : availableParticipants.length ? "Choose a participant to add" : "No matching users available"}</option>
              {availableParticipants.map(option => (
                <option key={option.id} value={option.id}>
                  {option.email}
                </option>
              ))}
            </select>
            {selectedParticipantIds.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Selected ({selectedParticipantIds.length})</p>
                <div className="flex flex-wrap gap-2">
                  {selectedParticipantIds.map(id => {
                    const option = participantOptions.find(item => item.id === id);
                    return (
                      <span key={id} className="inline-flex max-w-full items-center gap-2 rounded-full border border-[#cbd5c0] bg-white px-3 py-1.5 text-sm text-[#26342e]">
                        <span className="truncate">{option?.email ?? id}</span>
                        <button type="button" aria-label={`Remove ${option?.email ?? "participant"}`} onClick={() => setSelectedParticipantIds(current => current.filter(item => item !== id))} className="shrink-0 text-slate-500 hover:text-red-600"><X size={14} /></button>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
            {participantsLoading && <p className="mt-2 text-xs text-slate-500">Loading institutional users…</p>}
            {participantsError && <p className="mt-2 text-sm text-amber-700" role="status">{participantsError} You can still create the meeting and add participants afterwards.</p>}
            {!participantsLoading && !participantsError && participantOptions.length === 0 && <p className="mt-2 text-sm text-slate-500">No participant accounts are available.</p>}
          </div>

          {type === "online" && (
            <div className="rounded-xl border border-[#b8c3a4] bg-[#f3f5ea] p-4">
              <div className="flex items-center gap-2 font-semibold text-[#315247]"><Video size={17} /> Online meeting link</div>
              <p className="mt-1 text-sm text-slate-600">Paste your Google Meet, Zoom, Microsoft Teams, Jitsi, or any other conference link. If you leave it empty, the system will generate a Jitsi link automatically.</p>
              <input name="conference_url" className="input mt-3 bg-white" type="url" placeholder="https://meet.google.com/..." />
              <p className="mt-2 text-xs text-slate-500">The link will be available on the meeting record for participant invitations.</p>
            </div>
          )}
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}
          <button className="btn btn-primary" disabled={saving}>{saving ? "Creating meeting..." : type === "online" ? "Create online meeting" : "Save draft"}</button>
        </form>
      </section>
    </div>
  );
}
