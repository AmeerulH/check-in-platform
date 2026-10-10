import { AppShell } from "@/components/app/app-shell";
import { AttendanceUpload } from "@/components/attendance/attendance-upload";
import { requireStaffMember } from "@/lib/auth/staff";
import { EVENT_ID } from "@/lib/event";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function AttendanceUploadPage() {
  const staff = await requireStaffMember(["organizer"]);
  const { data: eventDays } = await createSupabaseAdminClient()
    .from("event_days")
    .select("local_date")
    .eq("event_id", EVENT_ID)
    .order("local_date");

  return (
    <AppShell currentPath="/admin/attendance-upload" staffMember={staff}>
      <div className="workspace">
        <header className="workspace-heading">
          <div>
            <p className="eyebrow">Backup attendance</p>
            <h1>Upload who attended</h1>
            <p>
              Use this after a paper roster or an offline list. Download the roster from Check-ins,
              mark Y for people who attended, then preview and save it here for one event day.
            </p>
          </div>
        </header>
        <AttendanceUpload eventDays={(eventDays ?? []).map((eventDay) => eventDay.local_date)} />
      </div>
    </AppShell>
  );
}
