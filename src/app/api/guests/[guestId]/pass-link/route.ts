import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api/response";
import { requireApiStaff } from "@/lib/auth/api";
import { EVENT_ID } from "@/lib/event";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const paramsSchema = z.object({ guestId: z.uuid() });

export async function GET(
  _request: Request,
  context: { params: Promise<{ guestId: string }> },
) {
  const access = await requireApiStaff(["organizer"]);
  if (access.error) return access.error;

  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return apiError({
      code: "GUEST_NOT_FOUND",
      message: "We could not find this guest.",
      status: 404,
    });
  }

  const admin = createSupabaseAdminClient();
  const { data: credential, error } = await admin
    .from("guest_credentials")
    .select("storage_path, guest:guests!inner(id, status, event_id)")
    .eq("guest_id", params.data.guestId)
    .is("revoked_at", null)
    .maybeSingle();
  const guest = Array.isArray(credential?.guest) ? credential.guest[0] : credential?.guest;

  if (error || !credential || !guest || guest.event_id !== EVENT_ID || guest.status !== "active") {
    return apiError({
      code: "GUEST_NOT_FOUND",
      message: "We could not find an active QR pass for this guest.",
      status: 404,
    });
  }

  if (!credential.storage_path) {
    return apiError({
      code: "PASS_FILE_UNAVAILABLE",
      message:
        "This QR was created before secure pass storage was enabled. Generate a replacement pass once to share its direct link.",
      status: 404,
    });
  }

  const { data: linkFile, error: linkError } = await admin.storage
    .from("guest-passes")
    .download(`${credential.storage_path}.txt`);
  const passUrl = linkFile ? (await linkFile.text()).trim() : "";

  if (linkError || !passUrl) {
    return apiError({
      code: "PASS_FILE_UNAVAILABLE",
      message:
        "The direct link is unavailable for this QR. Generate a replacement pass once to enable link sharing.",
      status: 404,
    });
  }

  return apiSuccess({ data: { passUrl } });
}
