"use client";

import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { GuestActions } from "@/components/guests/guest-actions";

export type DirectoryGuest = {
  id: string; display_name: string; normalized_email: string; organization: string | null;
  category: string | null; ticket_type: string | null; speaker_mode: string | null;
  status: string; email_marked_sent_at: string | null; created_at: string;
};

export function GuestDirectory({ guests }: { guests: DirectoryGuest[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [ticket, setTicket] = useState("");
  const [speakerMode, setSpeakerMode] = useState("");
  const [sort, setSort] = useState("name");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const tickets = [...new Set(guests.map((guest) => guest.ticket_type).filter((value): value is string => Boolean(value)))].sort();
  const filtered = useMemo(() => guests.filter((guest) => {
    const text = `${guest.display_name} ${guest.normalized_email} ${guest.organization ?? ""}`.toLowerCase();
    return text.includes(search.trim().toLowerCase()) && (!ticket || guest.ticket_type === ticket) &&
      (!speakerMode || (guest.category?.toLowerCase() === "speaker" && (speakerMode === "unassigned" ? !guest.speaker_mode : guest.speaker_mode === speakerMode)));
  }).sort((a, b) => {
    if (sort === "newest") return b.created_at.localeCompare(a.created_at);
    if (sort === "organization") return (a.organization ?? "").localeCompare(b.organization ?? "");
    if (sort === "ticket") return (a.ticket_type ?? "").localeCompare(b.ticket_type ?? "");
    return a.display_name.localeCompare(b.display_name);
  }), [guests, search, ticket, speakerMode, sort]);

  async function setMode(guestId: string, mode: string) {
    setBusyId(guestId); setMessage("");
    try {
      const response = await fetch(`/api/guests/${guestId}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "speaker_mode", mode: mode || null }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Could not update speaker mode.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not update speaker mode."); }
    finally { setBusyId(null); }
  }

  return <section className="content-panel">
    <div className="directory-toolbar directory-filter-row">
      <label><span className="sr-only">Search guests</span><input onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email or organization" type="search" value={search} /></label>
      <label><span className="sr-only">Ticket type</span><select onChange={(event) => setTicket(event.target.value)} value={ticket}><option value="">All tickets</option>{tickets.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label><span className="sr-only">Speaker attendance mode</span><select onChange={(event) => setSpeakerMode(event.target.value)} value={speakerMode}><option value="">All speaker modes</option><option value="in_person">In-person speakers</option><option value="virtual">Virtual speakers</option><option value="unassigned">Unassigned speakers</option></select></label>
      <label><span className="sr-only">Sort guests</span><select onChange={(event) => setSort(event.target.value)} value={sort}><option value="name">Name A–Z</option><option value="organization">Organization A–Z</option><option value="ticket">Ticket A–Z</option><option value="newest">Newest first</option></select></label>
      <span className="guest-count">{filtered.length} of {guests.length} invitees</span>
    </div>
    {message && <p className="status-message status-error" role="alert">{message}</p>}
    <div className="table-wrap"><table className="guest-directory-table"><thead><tr><th>Guest</th><th>Organization</th><th>Ticket</th><th>Speaker mode</th><th>Email</th><th><span className="sr-only">Actions</span></th></tr></thead>
      <tbody>{filtered.map((guest) => <tr key={guest.id}>
        <td data-label="Guest"><div className="guest-table-cell"><strong>{guest.display_name}</strong><span>{guest.normalized_email}</span></div></td>
        <td data-label="Organization">{guest.organization ?? "—"}</td>
        <td data-label="Ticket">{guest.ticket_type ?? guest.category ?? "—"}</td>
        <td data-label="Speaker mode">{guest.category?.toLowerCase() === "speaker" ? <span className="inline-loading-control"><select aria-label={`Attendance mode for ${guest.display_name}`} disabled={busyId === guest.id} onChange={(event) => void setMode(guest.id, event.target.value)} value={guest.speaker_mode ?? ""}><option value="">Unassigned</option><option value="in_person">In-person</option><option value="virtual">Virtual</option></select>{busyId === guest.id && <span role="status"><LoaderCircle aria-hidden="true" className="spin" size={16} /><span className="sr-only">Saving speaker mode</span></span>}</span> : "—"}</td>
        <td data-label="Email">{guest.email_marked_sent_at ? <span className="status-badge status-checked_in">Marked sent</span> : <span className="status-badge status-not_arrived">Not marked sent</span>}</td>
        <td className="guest-actions-cell" data-label="Actions"><GuestActions guestEmail={guest.normalized_email} guestId={guest.id} guestName={guest.display_name} ticketType={guest.ticket_type} emailMarkedSentAt={guest.email_marked_sent_at} /></td>
      </tr>)}{!filtered.length && <tr><td colSpan={6}><div className="empty-state"><strong>No invitees match these filters</strong><span>Adjust the search or filter controls.</span></div></td></tr>}</tbody>
    </table></div>
    <p className="directory-footer"><Link href="/admin/imports">Review Sheet sync and participant guide</Link></p>
  </section>;
}
