"use client";

import { LoaderCircle, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import type { DirectoryGuest } from "@/components/guests/guest-directory";

const CATEGORIES = ["Delegate", "Speaker"];

export function GuestEditor({ guest }: { guest: DirectoryGuest }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const category = guest.category ?? "";
  const categories = CATEGORIES.includes(category) || !category ? CATEGORIES : [...CATEGORIES, category];

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const field = (name: string) => String(data.get(name) ?? "");
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/guests/${guest.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "edit", displayName: field("displayName"), email: field("email"), organization: field("organization"),
          title: field("title"), ticketType: field("ticketType"), category: field("category"),
          region: field("region"), country: field("country"),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error?.message ?? "Enter a full name and a valid email address.");
      dialogRef.current?.close();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save this guest.");
    } finally { setSaving(false); }
  }

  return <>
    <button aria-label={`Edit ${guest.display_name}`} className="guest-edit-button" onClick={() => { setError(""); dialogRef.current?.showModal(); }} title="Edit guest" type="button">
      <Pencil size={16} />
    </button>
    <dialog aria-labelledby={`edit-guest-${guest.id}`} className="guest-edit-dialog" ref={dialogRef}>
      {/* key remounts the form with fresh values each time the guest changes after a save or sync */}
      <form className="guest-edit-form" key={`${guest.id}:${guest.display_name}:${guest.normalized_email}:${guest.ticket_type}:${guest.category}:${guest.organization}:${guest.title}:${guest.region}:${guest.country}`} onSubmit={(event) => void save(event)}>
        <h2 id={`edit-guest-${guest.id}`}>Edit guest</h2>
        <p className="guest-edit-note">The registration Sheet is the source of truth. The next Sheet sync replaces any field that differs from its row, so fix the Sheet too for changes that should last.</p>
        <div className="guest-edit-grid">
          <label className="wide">Full name<input defaultValue={guest.display_name} maxLength={120} minLength={2} name="displayName" required /></label>
          <label className="wide">Email<input defaultValue={guest.normalized_email} maxLength={254} name="email" required type="email" /></label>
          <label>Organization<input defaultValue={guest.organization ?? ""} maxLength={160} name="organization" /></label>
          <label>Designation<input defaultValue={guest.title ?? ""} maxLength={160} name="title" /></label>
          <label>Ticket<input defaultValue={guest.ticket_type ?? ""} maxLength={120} name="ticketType" /></label>
          <label>Category<select defaultValue={category} name="category"><option value="">None</option>{categories.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Region<input defaultValue={guest.region ?? ""} maxLength={120} name="region" /></label>
          <label>Country<input defaultValue={guest.country ?? ""} maxLength={120} name="country" /></label>
        </div>
        {error && <p className="status-message status-error" role="alert">{error}</p>}
        <div className="guest-edit-actions">
          <button disabled={saving} onClick={() => dialogRef.current?.close()} type="button">Cancel</button>
          <button disabled={saving} type="submit">{saving && <LoaderCircle aria-hidden="true" className="spin" size={16} />}{saving ? "Saving…" : "Save changes"}</button>
        </div>
      </form>
    </dialog>
  </>;
}
