import Link from "next/link";

import { AppShell } from "@/components/app/app-shell";
import { GuestDirectory, type DirectoryGuest } from "@/components/guests/guest-directory";
import { requireStaffMember } from "@/lib/auth/staff";
import { EVENT_ID } from "@/lib/event";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function GuestsPage() {
  const staff = await requireStaffMember(["organizer"]);
  const { data: guests } = await createSupabaseAdminClient().from("guests")
    .select("id, display_name, normalized_email, organization, category, ticket_type, speaker_mode, status, email_marked_sent_at, created_at")
    .eq("event_id", EVENT_ID).order("display_name");
  return <AppShell currentPath="/admin/guests" staffMember={staff}>
    <div className="workspace">
      <header className="workspace-heading workspace-heading-actions"><div><p className="eyebrow">Guest directory</p><h1>Invitees</h1><p>Find, share and track individual guest passes.</p></div>
        <Link className="button button-primary" href="/admin/guests/new">Add guest</Link>
      </header>
      <GuestDirectory guests={(guests ?? []) as DirectoryGuest[]} />
    </div>
  </AppShell>;
}
