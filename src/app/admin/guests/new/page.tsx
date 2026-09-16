import { AppShell } from "@/components/app/app-shell";
import { GuestFormPreview } from "@/components/guests/guest-form-preview";
import { requireStaffMember } from "@/lib/auth/staff";

export const dynamic = "force-dynamic";

export default async function NewGuestPage() {
  const staffMember = await requireStaffMember(["organizer"]);

  return (
    <AppShell currentPath="/admin/guests" staffMember={staffMember}>
      <GuestFormPreview />
    </AppShell>
  );
}
