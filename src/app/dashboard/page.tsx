import { AppShell } from "@/components/app/app-shell";
import { requireStaffMember } from "@/lib/auth/staff";
import { EVENT_ID, EVENT_TIMEZONE } from "@/lib/event";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Attendance dashboard",
};

type EventDay = {
  id: string;
  local_date: string;
};

type RecentScan = {
  guestName: string;
  receivedAt: string;
  outcome: "valid_first" | "valid_repeat";
};

function localDate(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts();
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;

  return `${value("year")}-${value("month")}-${value("day")}`;
}

function formatEventDate(date: string) {
  return new Intl.DateTimeFormat("en-MY", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${date}T12:00:00+08:00`));
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ login?: string }>;
}) {
  const staffMember = await requireStaffMember();
  const { login } = await searchParams;
  const admin = createSupabaseAdminClient();
  const { data: eventDays } = await admin
    .from("event_days")
    .select("id, local_date")
    .eq("event_id", EVENT_ID)
    .order("local_date") as { data: EventDay[] | null };
  const currentLocalDate = localDate(EVENT_TIMEZONE);
  const eventDay =
    eventDays?.find((day) => day.local_date >= currentLocalDate) ??
    eventDays?.at(-1);

  const [{ count: inviteeCount }, { count: checkInCount }, { data: scanRows }] =
    await Promise.all([
      admin
        .from("guests")
        .select("*", { count: "exact", head: true })
        .eq("event_id", EVENT_ID)
        .eq("status", "active"),
      eventDay
        ? admin
            .from("daily_attendance")
            .select("*", { count: "exact", head: true })
            .eq("event_day_id", eventDay.id)
        : Promise.resolve({ count: 0 }),
      eventDay
        ? admin
            .from("scan_events")
            .select("guest_id, received_at, outcome")
            .eq("event_day_id", eventDay.id)
            .order("received_at", { ascending: false })
            .limit(8)
        : Promise.resolve({ data: [] }),
    ]);

  const guestIds = (scanRows ?? []).map((scan) => scan.guest_id);
  const { data: scanGuests } = guestIds.length
    ? await admin.from("guests").select("id, display_name").in("id", guestIds)
    : { data: [] };
  const guestNames = new Map(
    (scanGuests ?? []).map((guest) => [guest.id, guest.display_name]),
  );
  const recentScans: RecentScan[] = (scanRows ?? []).map((scan) => ({
    guestName: guestNames.get(scan.guest_id) ?? "Guest",
    receivedAt: new Intl.DateTimeFormat("en-MY", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: EVENT_TIMEZONE,
    }).format(new Date(scan.received_at)),
    outcome: scan.outcome,
  }));
  const invited = inviteeCount ?? 0;
  const checkedIn = checkInCount ?? 0;
  const notArrived = Math.max(invited - checkedIn, 0);
  const attendanceRate = invited ? Math.round((checkedIn / invited) * 100) : 0;

  return (
    <AppShell currentPath="/dashboard" staffMember={staffMember}>
      <div className="workspace">
        <header className="workspace-heading">
          <div>
            <p className="eyebrow">
              {eventDay ? formatEventDate(eventDay.local_date) : "Event day unavailable"}
            </p>
            <h1>Today’s attendance</h1>
          </div>
          <span className="connection-status">Live updates coming with scanning</span>
        </header>
        {login === "success" && (
          <p className="status-message status-success" role="status">
            Signed in successfully. Your staff access is active.
          </p>
        )}
        <section aria-label="Attendance summary" className="metric-grid">
          <article>
            <span>Invited today</span>
            <strong>{invited}</strong>
            <small>Active guest passes</small>
          </article>
          <article>
            <span>Checked in</span>
            <strong>{checkedIn}</strong>
            <small>{attendanceRate}% attendance</small>
          </article>
          <article>
            <span>Not arrived</span>
            <strong>{notArrived}</strong>
            <small>For this event day</small>
          </article>
        </section>
        <section className="content-panel">
          <div className="panel-heading">
            <div>
              <h2>Recent activity</h2>
              <p>New and repeat scans appear here after server confirmation.</p>
            </div>
          </div>
          <ol className="activity-list">
            {recentScans.map((scan) => (
              <li key={`${scan.guestName}-${scan.receivedAt}`}>
                <div className="activity-mark" aria-hidden="true" />
                <div>
                  <strong>{scan.guestName}</strong>
                  <span>
                    {scan.outcome === "valid_first" ? "First arrival" : "Repeat scan"}
                  </span>
                </div>
                <time>{scan.receivedAt}</time>
              </li>
            ))}
            {!recentScans.length && (
              <li className="activity-empty">
                <strong>No check-ins yet</strong>
                <span>Confirmed scans will appear here once the scanner is enabled.</span>
              </li>
            )}
          </ol>
        </section>
      </div>
    </AppShell>
  );
}
