import "server-only";

import { EVENT_ID } from "@/lib/event";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const PAGE_SIZE = 30;

export type AttendanceLogItem = {
  id: string;
  guestName: string;
  guestEmail: string;
  eventDate: string;
  outcome: "valid_first" | "valid_repeat";
  receivedAt: string;
};

export type AttendanceLogPage = {
  items: AttendanceLogItem[];
  nextOffset: number | null;
};

type ScanRecord = {
  id: string;
  guest_id: string;
  event_day_id: string;
  outcome: "valid_first" | "valid_repeat";
  received_at: string;
};

export async function getAttendanceLog({
  date,
  offset = 0,
  search,
}: {
  date?: string;
  offset?: number;
  search?: string;
}): Promise<AttendanceLogPage> {
  const admin = createSupabaseAdminClient();
  const { data: eventDays, error: eventDaysError } = await admin
    .from("event_days")
    .select("id, local_date")
    .eq("event_id", EVENT_ID);

  if (eventDaysError) throw new Error("Attendance event days are unavailable.");
  const eventDayIds = date
    ? (eventDays ?? []).filter((day) => day.local_date === date).map((day) => day.id)
    : (eventDays ?? []).map((day) => day.id);

  if (!eventDayIds.length) return { items: [], nextOffset: null };

  let matchingGuestIds: string[] | undefined;
  if (search) {
    const escapedSearch = search.replace(/[%_,()]/g, " ");
    const { data: guests, error: guestsError } = await admin
      .from("guests")
      .select("id")
      .eq("event_id", EVENT_ID)
      .or(`display_name.ilike.%${escapedSearch}%,normalized_email.ilike.%${escapedSearch}%`)
      .limit(500);
    if (guestsError) throw new Error("Guest search is unavailable.");
    matchingGuestIds = (guests ?? []).map((guest) => guest.id);
    if (!matchingGuestIds.length) return { items: [], nextOffset: null };
  }

  let query = admin
    .from("scan_events")
    .select("id, guest_id, event_day_id, outcome, received_at")
    .in("event_day_id", eventDayIds)
    .order("received_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE);

  if (matchingGuestIds) query = query.in("guest_id", matchingGuestIds);
  const { data: scans, error: scansError } = await query;
  if (scansError) throw new Error("Check-in records are unavailable.");

  const hasNextPage = (scans?.length ?? 0) > PAGE_SIZE;
  const records = ((scans ?? []) as ScanRecord[]).slice(0, PAGE_SIZE);
  const guestIds = [...new Set(records.map((scan) => scan.guest_id))];
  const { data: guests, error: guestsError } = guestIds.length
    ? await admin
        .from("guests")
        .select("id, display_name, normalized_email")
        .in("id", guestIds)
    : { data: [], error: null };
  if (guestsError) throw new Error("Guest records are unavailable.");

  const guestMap = new Map(
    (guests ?? []).map((guest) => [
      guest.id,
      { name: guest.display_name, email: guest.normalized_email },
    ]),
  );
  const dayMap = new Map((eventDays ?? []).map((day) => [day.id, day.local_date]));
  const items = records.map((scan) => ({
    id: scan.id,
    guestName: guestMap.get(scan.guest_id)?.name ?? "Guest",
    guestEmail: guestMap.get(scan.guest_id)?.email ?? "—",
    eventDate: dayMap.get(scan.event_day_id) ?? "—",
    outcome: scan.outcome,
    receivedAt: scan.received_at,
  }));

  return {
    items,
    nextOffset: hasNextPage ? offset + PAGE_SIZE : null,
  };
}
