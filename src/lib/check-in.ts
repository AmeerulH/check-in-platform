import "server-only";

import type { ApiErrorCode } from "@/lib/api/response";
import { EVENT_ID } from "@/lib/event";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type AttendanceMethod = "manual" | "import";

export type RecordedAttendance = {
  guest_id: string;
  guest_name: string;
  event_day_date: string;
  outcome: "valid_first" | "valid_repeat";
  scan_count: number;
  received_at: string;
  already_processed: boolean;
};

type RpcRow = {
  out_guest_id: string;
  out_guest_name: string;
  out_event_day_date: string;
  out_outcome: "valid_first" | "valid_repeat";
  out_scan_count: number;
  out_received_at: string;
  out_already_processed: boolean;
};

type CheckInStatus = 400 | 403 | 404 | 503;

export class CheckInRequestError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    readonly status: CheckInStatus,
    message: string,
  ) {
    super(message);
  }
}

export function describeCheckInError(message: string | undefined) {
  if (!message) return null;
  if (message.includes("PASS_INVALID_OR_REVOKED")) {
    return new CheckInRequestError(
      "PASS_INVALID_OR_REVOKED",
      404,
      "This guest pass is invalid or is no longer active.",
    );
  }
  if (message.includes("GUEST_NOT_ACTIVE")) {
    return new CheckInRequestError(
      "SCAN_GUEST_UNAVAILABLE",
      404,
      "This guest is not active and cannot be checked in.",
    );
  }
  if (message.includes("EVENT_DAY_IN_FUTURE") || message.includes("EVENT_DAY_NOT_FOUND")) {
    return new CheckInRequestError(
      "SCAN_EVENT_DAY_UNAVAILABLE",
      400,
      "Choose an event day that has already started.",
    );
  }
  if (message.includes("EVENT_NOT_ACTIVE")) {
    return new CheckInRequestError(
      "SCAN_EVENT_NOT_ACTIVE",
      403,
      "Check-in is only available during the scheduled event dates.",
    );
  }
  if (message.includes("SCAN_ACCESS_DENIED")) {
    return new CheckInRequestError(
      "AUTH_ACCESS_DENIED",
      403,
      "Your staff access is unavailable for check-in.",
    );
  }
  return null;
}

function recordedAttendance(row: RpcRow): RecordedAttendance {
  return {
    guest_id: row.out_guest_id,
    guest_name: row.out_guest_name,
    event_day_date: row.out_event_day_date,
    outcome: row.out_outcome,
    scan_count: row.out_scan_count,
    received_at: row.out_received_at,
    already_processed: row.out_already_processed,
  };
}

export async function recordGuestAttendance({
  membershipId,
  authUserId,
  deviceLabel,
  guestId,
  clientScanId,
  method,
  eventDayDate,
  capturedAt,
  allowOutsideHours,
}: {
  membershipId: string;
  authUserId: string;
  deviceLabel: string;
  guestId: string;
  clientScanId: string;
  method: AttendanceMethod;
  eventDayDate?: string | null;
  capturedAt?: string | null;
  allowOutsideHours: boolean;
}) {
  const { data, error } = await createSupabaseAdminClient()
    .rpc("record_guest_attendance", {
      p_event_id: EVENT_ID,
      p_membership_id: membershipId,
      p_auth_user_id: authUserId,
      p_device_label: deviceLabel,
      p_guest_id: guestId,
      p_client_scan_id: clientScanId,
      p_method: method,
      p_event_day_date: eventDayDate ?? null,
      p_captured_at: capturedAt ?? null,
      p_allow_outside_hours: allowOutsideHours,
    })
    .single();

  if (error || !data) {
    throw describeCheckInError(error?.message) ?? new CheckInRequestError(
      "SCAN_RECORD_FAILED",
      503,
      "We could not confirm this check-in. Please try again.",
    );
  }

  return recordedAttendance(data as RpcRow);
}
