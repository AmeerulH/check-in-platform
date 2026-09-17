import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api/response";
import { requireApiStaff } from "@/lib/auth/api";
import { EVENT_ID } from "@/lib/event";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const paramsSchema = z.object({ guestId: z.uuid() });

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ guestId: string }> },
) {
  const access = await requireApiStaff(["organizer"]);
  if (access.error) return access.error;

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return apiError({
      code: "GUEST_NOT_FOUND",
      message: "We could not find this guest.",
      status: 404,
    });
  }

  const admin = createSupabaseAdminClient();
  const { data: guest, error } = await admin
    .from("guests")
    .delete()
    .eq("id", parsedParams.data.guestId)
    .eq("event_id", EVENT_ID)
    .select("id, display_name")
    .maybeSingle();

  if (error?.code === "23503") {
    return apiError({
      code: "GUEST_DELETE_HAS_ATTENDANCE",
      message:
        "This guest has check-in history and cannot be deleted. Deactivate the guest instead to preserve the attendance record.",
      status: 409,
    });
  }

  if (error) {
    console.error("Unable to delete guest.", { code: error.code });
    return apiError({
      code: "GUEST_DELETE_FAILED",
      message: "We could not delete this guest. Please try again shortly.",
      status: 503,
    });
  }

  if (!guest) {
    return apiError({
      code: "GUEST_NOT_FOUND",
      message: "We could not find this guest.",
      status: 404,
    });
  }

  await admin.from("audit_events").insert({
    event_id: EVENT_ID,
    actor_membership_id: access.staffMember.id,
    action: "guest.deleted",
    entity_type: "guest",
    entity_id: guest.id,
    metadata: { guestName: guest.display_name },
  });

  return apiSuccess({ data: { id: guest.id } });
}
