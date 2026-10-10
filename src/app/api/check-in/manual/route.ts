import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api/response";
import { requireApiStaff } from "@/lib/auth/api";
import { CheckInRequestError, recordGuestAttendance } from "@/lib/check-in";
import { isCheckInTestMode } from "@/lib/env/server";
import { EVENT_ID } from "@/lib/event";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const manualSchema = z.object({
  clientScanId: z.uuid(),
  deviceLabel: z.string().trim().min(3).max(80),
  guestId: z.uuid(),
});

export async function POST(request: Request) {
  const access = await requireApiStaff(["organizer", "scanner"]);
  if (access.error) return access.error;

  if (!access.staffMember.auth_user_id) {
    return apiError({
      code: "AUTH_ACCESS_DENIED",
      message: "Your staff session is not ready for check-in. Please sign in again.",
      status: 403,
    });
  }

  const parsed = manualSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError({
      code: "SCAN_INVALID_INPUT",
      message: "Choose a guest from the search results.",
      status: 400,
    });
  }

  try {
    const recorded = await recordGuestAttendance({
      membershipId: access.staffMember.id,
      authUserId: access.staffMember.auth_user_id,
      deviceLabel: parsed.data.deviceLabel,
      guestId: parsed.data.guestId,
      clientScanId: parsed.data.clientScanId,
      method: "manual",
      allowOutsideHours: isCheckInTestMode(),
    });

    await createSupabaseAdminClient().from("audit_events").insert({
      event_id: EVENT_ID,
      actor_membership_id: access.staffMember.id,
      action: "attendance.manual_check_in",
      entity_type: "guest",
      entity_id: recorded.guest_id,
      metadata: {
        eventDayDate: recorded.event_day_date,
        outcome: recorded.outcome,
        alreadyProcessed: recorded.already_processed,
      },
    });

    return apiSuccess({ data: recorded });
  } catch (error) {
    if (error instanceof CheckInRequestError) {
      if (error.code === "SCAN_RECORD_FAILED") {
        console.error("Unable to record manual check-in.");
      }
      return apiError({ code: error.code, message: error.message, status: error.status });
    }
    console.error("Unable to record manual check-in.");
    return apiError({
      code: "SCAN_RECORD_FAILED",
      message: "We could not confirm this check-in. Please try again.",
      status: 503,
    });
  }
}
