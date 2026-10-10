import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api/response";
import { requireApiStaff } from "@/lib/auth/api";
import { isCheckInTestMode } from "@/lib/env/server";
import { EVENT_ID } from "@/lib/event";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().trim().min(2).max(120),
});

export async function GET(request: Request) {
  const access = await requireApiStaff(["organizer", "scanner"]);
  if (access.error) return access.error;

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ q: url.searchParams.get("q") ?? "" });
  if (!parsed.success) {
    return apiError({
      code: "SCAN_INVALID_INPUT",
      message: "Enter at least two characters to search for a guest.",
      status: 400,
    });
  }

  const term = parsed.data.q.replace(/[%_,()]/g, " ").trim();
  if (term.length < 2) {
    return apiSuccess({ data: [] });
  }

  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const [{ data: guests, error: guestsError }, { data: eventDays, error: daysError }] = await Promise.all([
    admin
      .from("guests")
      .select("id, display_name, normalized_email, organization, ticket_type")
      .eq("event_id", EVENT_ID)
      .eq("status", "active")
      .or(`display_name.ilike.%${term}%,normalized_email.ilike.%${term}%,organization.ilike.%${term}%`)
      .order("display_name")
      .limit(10),
    admin
      .from("event_days")
      .select("id, opens_at, closes_at")
      .eq("event_id", EVENT_ID)
      .order("local_date"),
  ]);

  if (guestsError || daysError) {
    return apiError({
      code: "ATTENDANCE_UNAVAILABLE",
      message: "Guest search is temporarily unavailable. Please try again shortly.",
      status: 503,
    });
  }

  const openDay = (eventDays ?? []).find((day) => day.opens_at <= now && now <= day.closes_at);
  const eventDayId = openDay?.id ?? (isCheckInTestMode() ? eventDays?.[0]?.id : undefined);
  const guestIds = (guests ?? []).map((guest) => guest.id);
  const { data: attendance, error: attendanceError } = eventDayId && guestIds.length
    ? await admin
        .from("daily_attendance")
        .select("guest_id")
        .eq("event_day_id", eventDayId)
        .in("guest_id", guestIds)
    : { data: [], error: null };

  if (attendanceError) {
    return apiError({
      code: "ATTENDANCE_UNAVAILABLE",
      message: "Guest search is temporarily unavailable. Please try again shortly.",
      status: 503,
    });
  }

  const checkedIn = new Set((attendance ?? []).map((row) => row.guest_id));
  return apiSuccess({
    data: (guests ?? []).map((guest) => ({
      id: guest.id,
      displayName: guest.display_name,
      email: guest.normalized_email,
      organization: guest.organization,
      ticketType: guest.ticket_type,
      checkedInToday: checkedIn.has(guest.id),
    })),
  });
}
