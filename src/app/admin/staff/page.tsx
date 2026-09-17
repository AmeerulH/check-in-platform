import { AppShell } from "@/components/app/app-shell";
import { StaffAccessManager } from "@/components/staff/staff-access-manager";
import { requireStaffMember } from "@/lib/auth/staff";
import { EVENT_ID } from "@/lib/event";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const staffMember = await requireStaffMember(["organizer"]);
  const { data: staffMembers } = await createSupabaseAdminClient()
    .from("event_memberships")
    .select("id, normalized_email, role, active")
    .eq("event_id", EVENT_ID)
    .order("created_at");

  return (
    <AppShell currentPath="/admin/staff" staffMember={staffMember}>
      <div className="workspace">
        <header className="workspace-heading">
          <div>
            <p className="eyebrow">Workspace administration</p>
            <h1>Staff access</h1>
            <p>Organizers manage who can sign in and what they can do during the event.</p>
          </div>
        </header>
        <StaffAccessManager
          currentStaffMemberId={staffMember.id}
          staffMembers={staffMembers ?? []}
        />
      </div>
    </AppShell>
  );
}
