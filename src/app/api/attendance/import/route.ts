import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api/response";
import { requireApiStaff } from "@/lib/auth/api";
import { normalizeEmail } from "@/lib/auth/staff";
import { recordGuestAttendance } from "@/lib/check-in";
import { isCheckInTestMode } from "@/lib/env/server";
import { EVENT_ID, EVENT_TIMEZONE } from "@/lib/event";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const importSchema = z.object({
  date: z.iso.date(),
  dryRun: z.boolean(),
  emails: z.array(z.string().trim().min(1).max(200)).min(1).max(2_000),
});

type GuestMatch = {
  id: string;
  email: string;
  status: string;
};

function todayInKualaLumpur() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: EVENT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function listedEmail(value: string) {
  const parsed = z.email().safeParse(value.trim());
  return parsed.success ? normalizeEmail(parsed.data) : null;
}

async function mapPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let index = 0;
  async function run() {
    while (index < items.length) {
      const current = index;
      index += 1;
      await worker(items[current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
}

export async function POST(request: Request) {
  const access = await requireApiStaff(["organizer"]);
  if (access.error) return access.error;

  if (!access.staffMember.auth_user_id) {
    return apiError({
      code: "AUTH_ACCESS_DENIED",
      message: "Your staff session is not ready for check-in. Please sign in again.",
      status: 403,
    });
  }

  const parsed = importSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError({
      code: "ATTENDANCE_IMPORT_INVALID",
      message: "Choose an event day and include at least one email address.",
      status: 400,
    });
  }

  if (parsed.data.date > todayInKualaLumpur() && !isCheckInTestMode()) {
    return apiError({
      code: "SCAN_EVENT_DAY_UNAVAILABLE",
      message: "Choose an event day that has already started.",
      status: 400,
    });
  }

  const unknown: string[] = [];
  const uniqueEmails: string[] = [];
  const seen = new Set<string>();
  for (const value of parsed.data.emails) {
    const email = listedEmail(value);
    if (!email) {
      unknown.push(value.trim());
      continue;
    }
    if (seen.has(email)) continue;
    seen.add(email);
    uniqueEmails.push(email);
  }

  const admin = createSupabaseAdminClient();
  const { data: eventDay, error: dayError } = await admin
    .from("event_days")
    .select("id, local_date")
    .eq("event_id", EVENT_ID)
    .eq("local_date", parsed.data.date)
    .maybeSingle();

  if (dayError) {
    return apiError({
      code: "ATTENDANCE_UNAVAILABLE",
      message: "Attendance upload is temporarily unavailable. Please try again shortly.",
      status: 503,
    });
  }
  if (!eventDay) {
    return apiError({
      code: "SCAN_EVENT_DAY_UNAVAILABLE",
      message: "Choose one of the scheduled event days.",
      status: 400,
    });
  }

  const matches: GuestMatch[] = [];
  try {
    for (let index = 0; index < uniqueEmails.length; index += 150) {
      const chunk = uniqueEmails.slice(index, index + 150);
      const { data, error } = await admin
        .from("guests")
        .select("id, normalized_email, status")
        .eq("event_id", EVENT_ID)
        .in("normalized_email", chunk);
      if (error) throw new Error(error.message);
      matches.push(...(data ?? []).map((guest) => ({
        id: guest.id,
        email: guest.normalized_email,
        status: guest.status,
      })));
    }
  } catch (error) {
    console.error("Unable to match attendance upload.", error);
    return apiError({
      code: "ATTENDANCE_UNAVAILABLE",
      message: "Attendance upload is temporarily unavailable. Please try again shortly.",
      status: 503,
    });
  }

  const guestsByEmail = new Map(matches.map((guest) => [guest.email, guest]));
  const inactive: string[] = [];
  const active: GuestMatch[] = [];
  for (const email of uniqueEmails) {
    const guest = guestsByEmail.get(email);
    if (!guest) unknown.push(email);
    else if (guest.status !== "active") inactive.push(email);
    else active.push(guest);
  }

  const already = new Set<string>();
  if (active.length) {
    try {
      for (let index = 0; index < active.length; index += 150) {
        const chunk = active.slice(index, index + 150).map((guest) => guest.id);
        const { data, error } = await admin
          .from("daily_attendance")
          .select("guest_id")
          .eq("event_day_id", eventDay.id)
          .in("guest_id", chunk);
        if (error) throw new Error(error.message);
        for (const row of data ?? []) already.add(row.guest_id);
      }
    } catch (error) {
      console.error("Unable to read existing attendance.", error);
      return apiError({
        code: "ATTENDANCE_UNAVAILABLE",
        message: "Attendance upload is temporarily unavailable. Please try again shortly.",
        status: 503,
      });
    }
  }

  const ready = active.filter((guest) => !already.has(guest.id));
  let alreadyCheckedIn = already.size;
  let newlyCheckedIn = parsed.data.dryRun ? ready.length : 0;
  const failed: string[] = [];

  if (!parsed.data.dryRun && ready.length) {
    const authUserId = access.staffMember.auth_user_id;
    await mapPool(ready, 8, async (guest) => {
      try {
        const recorded = await recordGuestAttendance({
          membershipId: access.staffMember.id,
          authUserId,
          deviceLabel: "Attendance import",
          guestId: guest.id,
          clientScanId: crypto.randomUUID(),
          method: "import",
          eventDayDate: eventDay.local_date,
          allowOutsideHours: isCheckInTestMode(),
        });
        if (recorded.already_processed) alreadyCheckedIn += 1;
        else newlyCheckedIn += 1;
      } catch (error) {
        console.error("Unable to import one attendance row.", error);
        failed.push(guest.email);
      }
    });

    await admin.from("audit_events").insert({
      event_id: EVENT_ID,
      actor_membership_id: access.staffMember.id,
      action: "attendance.imported",
      entity_type: "event_day",
      entity_id: eventDay.id,
      metadata: {
        date: eventDay.local_date,
        newlyCheckedIn,
        alreadyCheckedIn,
        unknownCount: unknown.length,
        inactiveCount: inactive.length,
        failedCount: failed.length,
      },
    });
  }

  return apiSuccess({
    data: {
      dryRun: parsed.data.dryRun,
      date: eventDay.local_date,
      received: parsed.data.emails.length,
      matched: active.length,
      alreadyCheckedIn,
      newlyCheckedIn,
      unknownCount: unknown.length,
      inactiveCount: inactive.length,
      failedCount: failed.length,
      unknown: unknown.slice(0, 50),
      inactive: inactive.slice(0, 50),
      failed: failed.slice(0, 50),
    },
  });
}
