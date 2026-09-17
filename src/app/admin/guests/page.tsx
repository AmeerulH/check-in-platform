import Link from "next/link";
import { Plus, Search } from "lucide-react";

import { AppShell } from "@/components/app/app-shell";
import { GuestActions } from "@/components/guests/guest-actions";
import { requireStaffMember } from "@/lib/auth/staff";
import { EVENT_ID } from "@/lib/event";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function GuestsPage() {
  const staffMember = await requireStaffMember(["organizer"]);
  const { data: guests } = await createSupabaseAdminClient()
    .from("guests")
    .select("id, display_name, normalized_email, organization, category, status")
    .eq("event_id", EVENT_ID)
    .order("created_at", { ascending: false });

  return (
    <AppShell currentPath="/admin/guests" staffMember={staffMember}>
      <div className="workspace">
        <header className="workspace-heading workspace-heading-actions">
          <div>
            <p className="eyebrow">Guest directory</p>
            <h1>Invitees</h1>
            <p>Search, add and prepare passes for the conference guest list.</p>
          </div>
          <Link className="button button-primary" href="/admin/guests/new">
            <Plus aria-hidden="true" size={18} />
            Add guest
          </Link>
        </header>
        <section className="content-panel">
          <div className="directory-toolbar">
            <label className="search-field">
              <Search aria-hidden="true" size={18} />
              <span className="sr-only">Search guests</span>
              <input placeholder="Search name or email" type="search" />
            </label>
            <span className="guest-count">{guests?.length ?? 0} invitees</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Guest</th>
                  <th>Organization</th>
                  <th>Category</th>
                  <th>Today</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {guests?.map((guest) => (
                    <tr key={guest.id}>
                      <td>
                        <strong>{guest.display_name}</strong>
                        <span>{guest.normalized_email}</span>
                      </td>
                      <td>{guest.organization ?? "—"}</td>
                      <td>{guest.category ?? "—"}</td>
                      <td>
                        <span className="status-badge status-not_arrived">
                          {guest.status === "active" ? "Pass not scanned" : "Inactive"}
                        </span>
                      </td>
                      <td>
                        <GuestActions
                          guestEmail={guest.normalized_email}
                          guestId={guest.id}
                          guestName={guest.display_name}
                        />
                      </td>
                    </tr>
                  ))}
                {!guests?.length && (
                  <tr>
                    <td colSpan={5}>
                      <div className="empty-state">
                        <strong>No invitees yet</strong>
                        <span>Add the first guest to generate their QR pass.</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
