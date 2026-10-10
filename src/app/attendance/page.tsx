import Link from "next/link";

import { AttendanceLog } from "@/components/attendance/attendance-log";
import { AppShell } from "@/components/app/app-shell";
import { getAttendanceLog } from "@/lib/attendance";
import { requireStaffMember } from "@/lib/auth/staff";
import { EVENT_ID } from "@/lib/event";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function AttendancePage() {
  const staffMember = await requireStaffMember(["organizer", "scanner", "viewer"]);
  const admin = createSupabaseAdminClient();
  const [{ data: eventDays }, initialPage] = await Promise.all([
    admin
      .from("event_days")
      .select("local_date")
      .eq("event_id", EVENT_ID)
      .order("local_date"),
    getAttendanceLog({}),
  ]);

  return (
    <AppShell currentPath="/attendance" staffMember={staffMember}>
      <div className="workspace attendance-workspace">
        <header className="workspace-heading workspace-heading-actions">
          <div>
            <p className="eyebrow">Attendance record</p>
            <h1>All check-ins</h1>
            <p>Search confirmed arrivals and review repeat scans across every event day.</p>
          </div>
          <div className="heading-actions">
            {staffMember.role !== "scanner" && (
              <a className="button button-secondary" href="/api/attendance/roster">Download roster</a>
            )}
            {staffMember.role === "organizer" && (
              <Link className="button button-primary" href="/admin/attendance-upload">Upload attendance</Link>
            )}
          </div>
        </header>
        <AttendanceLog
          eventDays={(eventDays ?? []).map((eventDay) => eventDay.local_date)}
          initialPage={initialPage}
        />
      </div>
    </AppShell>
  );
}
