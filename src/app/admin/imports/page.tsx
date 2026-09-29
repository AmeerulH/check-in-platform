import { AppShell } from "@/components/app/app-shell";
import { RegistrationImportManager } from "@/components/guests/registration-import-manager";
import { requireStaffMember } from "@/lib/auth/staff";
import { EVENT_ID } from "@/lib/event";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function ImportsPage() {
  const staff = await requireStaffMember(["organizer"]);
  const admin = createSupabaseAdminClient();
  const [{ data: latest }, { data: changes }, { data: guide }] = await Promise.all([
    admin.from("imports").select("id, status, summary, created_at").eq("event_id", EVENT_ID)
      .eq("source_filename", "GTP2026 Registration Namelist / Sheet1").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("guest_source_changes").select("id, proposed, guest:guests(display_name, normalized_email, ticket_type, category, title, organization, region, country, external_reference)")
      .eq("event_id", EVENT_ID).eq("status", "pending").order("created_at", { ascending: false }),
    admin.from("event_documents").select("file_name, uploaded_at").eq("event_id", EVENT_ID)
      .eq("document_key", "participant_guide").maybeSingle(),
  ]);
  return (
    <AppShell currentPath="/admin/imports" staffMember={staff}>
      <div className="workspace">
        <header className="workspace-heading">
          <div><p className="eyebrow">Guest list</p><h1>Registration Sheet sync</h1>
            <p>New invitees import automatically each morning. Review changes to existing guests before applying them.</p></div>
        </header>
        <RegistrationImportManager latest={latest} changes={(changes ?? []).map((change) => ({
          id: change.id, proposed: change.proposed as Record<string, string | null>,
          guest: (Array.isArray(change.guest) ? change.guest[0] : change.guest) as Record<string, string | null> | null,
        }))} guide={guide} />
      </div>
    </AppShell>
  );
}
