import Link from "next/link";

import { AppShell } from "@/components/app/app-shell";
import { GuestDirectory, type DirectoryGuest } from "@/components/guests/guest-directory";
import { requireStaffMember } from "@/lib/auth/staff";
import { EVENT_ID } from "@/lib/event";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function GuestsPage() {
  const staff = await requireStaffMember(["organizer"]);
  const admin = createSupabaseAdminClient();
  // Page through the roster: a single query is capped at 1,000 rows.
  const guests: DirectoryGuest[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await admin.from("guests")
      .select("id, display_name, normalized_email, organization, category, ticket_type, speaker_mode, status, email_marked_sent_at, created_at")
      .eq("event_id", EVENT_ID).order("display_name").order("id").range(from, from + 999);
    guests.push(...((data ?? []) as DirectoryGuest[]));
    if ((data?.length ?? 0) < 1000) break;
  }
  const { data: changes } = await admin.from("guest_source_changes").select("id, guest_id, proposed")
    .eq("event_id", EVENT_ID).eq("status", "pending").order("created_at", { ascending: false });
  const pendingByGuest = new Map<string, { changeId: string; name: string; email: string }>();
  for (const change of changes ?? []) {
    if (pendingByGuest.has(change.guest_id)) continue;
    const proposed = change.proposed as { display_name?: string; normalized_email?: string };
    pendingByGuest.set(change.guest_id, { changeId: change.id, name: proposed.display_name ?? "", email: proposed.normalized_email ?? "" });
  }
  return <AppShell currentPath="/admin/guests" staffMember={staff}>
    <div className="workspace">
      <header className="workspace-heading workspace-heading-actions"><div><p className="eyebrow">Guest directory</p><h1>Invitees</h1><p>Find, share and track individual guest passes.</p></div>
        <Link className="button button-primary" href="/admin/guests/new">Add guest</Link>
      </header>
      <GuestDirectory guests={guests.map((guest) => ({ ...guest, pending: pendingByGuest.get(guest.id) ?? null }))} />
    </div>
  </AppShell>;
}
