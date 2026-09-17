import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api/response";
import { requireApiStaff } from "@/lib/auth/api";
import { digestCredentialToken } from "@/lib/credentials";
import { getPublicEnv } from "@/lib/env/public";
import { EVENT_ID } from "@/lib/event";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const checkInSchema = z.object({
  clientScanId: z.uuid(),
  deviceLabel: z.string().trim().min(3).max(80),
  payload: z.string().trim().min(1).max(2_000),
  capturedAt: z.iso.datetime().optional(),
});

const passPathSchema = z.object({
  publicId: z.uuid(),
  token: z.string().regex(/^v1\.[A-Za-z0-9_-]{40,}$/),
});

type CheckInResult = {
  guest_id: string;
  guest_name: string;
  event_day_date: string;
  outcome: "valid_first" | "valid_repeat";
  scan_count: number;
  received_at: string;
  already_processed: boolean;
};

function parsePassPayload(payload: string) {
  try {
    const appUrl = new URL(getPublicEnv().NEXT_PUBLIC_APP_URL);
    const scannedUrl = new URL(payload);
    if (scannedUrl.origin !== appUrl.origin) return null;

    const match = scannedUrl.pathname.match(/^\/pass\/([^/]+)$/);
    return passPathSchema.safeParse({
      publicId: match?.[1],
      token: scannedUrl.hash.slice(1),
    }).data ?? null;
  } catch {
    return null;
  }
}

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

  const body = await request.json().catch(() => null);
  const parsed = checkInSchema.safeParse(body);
  const pass = parsed.success ? parsePassPayload(parsed.data.payload) : null;

  if (!parsed.success || !pass) {
    return apiError({
      code: "SCAN_INVALID_INPUT",
      message: "This is not a valid GTP guest pass.",
      status: 400,
    });
  }

  const { data, error } = await createSupabaseAdminClient()
    .rpc("record_check_in", {
      p_event_id: EVENT_ID,
      p_membership_id: access.staffMember.id,
      p_auth_user_id: access.staffMember.auth_user_id,
      p_device_label: parsed.data.deviceLabel,
      p_public_id: pass.publicId,
      p_token_digest: digestCredentialToken(pass.token),
      p_client_scan_id: parsed.data.clientScanId,
      p_captured_at: parsed.data.capturedAt ?? null,
    })
    .single();
  const result = data as CheckInResult | null;

  if (error?.message.includes("PASS_INVALID_OR_REVOKED")) {
    return apiError({
      code: "PASS_INVALID_OR_REVOKED",
      message: "This guest pass is invalid or is no longer active.",
      status: 404,
    });
  }

  if (error?.message.includes("EVENT_NOT_ACTIVE")) {
    return apiError({
      code: "SCAN_EVENT_NOT_ACTIVE",
      message: "Check-in is only available during the scheduled event dates.",
      status: 403,
    });
  }

  if (error?.message.includes("SCAN_ACCESS_DENIED")) {
    return apiError({
      code: "AUTH_ACCESS_DENIED",
      message: "Your staff access is unavailable for check-in.",
      status: 403,
    });
  }

  if (error || !result) {
    console.error("Unable to record check-in.", { code: error?.code });
    return apiError({
      code: "SCAN_RECORD_FAILED",
      message: "We could not confirm this check-in. Please try again.",
      status: 503,
    });
  }

  return apiSuccess({ data: result });
}
