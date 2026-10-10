import { apiError } from "@/lib/api/response";
import { requireApiStaff } from "@/lib/auth/api";
import { toCsv } from "@/lib/csv";
import { EVENT_ID, EVENT_TIMEZONE } from "@/lib/event";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type GuestRow = {
  id: string;
  display_name: string;
  normalized_email: string;
  organization: string | null;
  ticket_type: string | null;
};

type AttendanceRow = {
  guest_id: string;
  event_day_id: string;
  first_scan_at: string;
};

function formatDay(date: string) {
  return new Intl.DateTimeFormat("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: EVENT_TIMEZONE,
  }).format(new Date(`${date}T12:00:00+08:00`));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-MY", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: EVENT_TIMEZONE,
  }).format(new Date(value));
}

async function selectAll<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const rows: T[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}

export async function GET() {
  const access = await requireApiStaff(["organizer", "viewer"]);
  if (access.error) return access.error;

  try {
    const admin = createSupabaseAdminClient();
    const { data: eventDays, error: daysError } = await admin
      .from("event_days")
      .select("id, local_date")
      .eq("event_id", EVENT_ID)
      .order("local_date");
    if (daysError) throw new Error(daysError.message);

    const days = eventDays ?? [];
    const guests = await selectAll<GuestRow>((from, to) => admin
      .from("guests")
      .select("id, display_name, normalized_email, organization, ticket_type")
      .eq("event_id", EVENT_ID)
      .eq("status", "active")
      .order("display_name")
      .order("id")
      .range(from, to));
    const attendance = days.length
      ? await selectAll<AttendanceRow>((from, to) => admin
          .from("daily_attendance")
          .select("guest_id, event_day_id, first_scan_at")
          .in("event_day_id", days.map((day) => day.id))
          .order("id")
          .range(from, to))
      : [];
    const checkedInAt = new Map(
      attendance.map((row) => [`${row.guest_id}:${row.event_day_id}`, formatTime(row.first_scan_at)]),
    );
    const header = [
      "Name",
      "Email",
      "Organisation",
      "Ticket",
      ...days.map((day) => formatDay(day.local_date)),
      "Checked in (Y)",
    ];
    const body = guests.map((guest) => [
      guest.display_name,
      guest.normalized_email,
      guest.organization ?? "",
      guest.ticket_type ?? "",
      ...days.map((day) => checkedInAt.get(`${guest.id}:${day.id}`) ?? ""),
      "",
    ]);
    const csv = `\uFEFF${toCsv([header, ...body])}`;

    return new Response(csv, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": 'attachment; filename="gtp-attendance-roster.csv"',
        "Content-Type": "text/csv; charset=utf-8",
      },
    });
  } catch (error) {
    console.error("Unable to build attendance roster.", error);
    return apiError({
      code: "ATTENDANCE_UNAVAILABLE",
      message: "The roster is temporarily unavailable. Please try again shortly.",
      status: 503,
    });
  }
}
