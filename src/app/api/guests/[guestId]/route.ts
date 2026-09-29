import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api/response";
import { requireApiStaff } from "@/lib/auth/api";
import { EVENT_ID } from "@/lib/event";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const paramsSchema = z.object({ guestId: z.uuid() });
const updateSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("speaker_mode"), mode: z.enum(["in_person", "virtual"]).nullable() }),
  z.object({ action: z.literal("mark_email_sent") }),
]);

export async function PATCH(request: Request, context: { params: Promise<{ guestId: string }> }) {
  const access = await requireApiStaff(["organizer"]);
  if (access.error) return access.error;
  const params = paramsSchema.safeParse(await context.params);
  const body = updateSchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) return apiError({ code: "GUEST_INVALID_INPUT", message: "Invalid guest update.", status: 400 });
  const admin = createSupabaseAdminClient();
  const { data: guest } = await admin.from("guests").select("id, category")
    .eq("event_id", EVENT_ID).eq("id", params.data.guestId).maybeSingle();
  if (!guest) return apiError({ code: "GUEST_NOT_FOUND", message: "Guest not found.", status: 404 });
  if (body.data.action === "speaker_mode" && guest.category?.toLowerCase() !== "speaker") {
    return apiError({ code: "GUEST_INVALID_INPUT", message: "Attendance mode is only available for speakers.", status: 400 });
  }
  const values = body.data.action === "speaker_mode"
    ? { speaker_mode: body.data.mode }
    : { email_marked_sent_at: new Date().toISOString(), email_marked_sent_by: access.staffMember.id };
  const { error } = await admin.from("guests").update(values).eq("id", guest.id);
  if (error) return apiError({ code: "AUTH_SERVICE_UNAVAILABLE", message: "Guest update failed.", status: 503 });
  await admin.from("audit_events").insert({ event_id: EVENT_ID, actor_membership_id: access.staffMember.id,
    action: body.data.action === "speaker_mode" ? "guest.speaker_mode_updated" : "guest.email_marked_sent",
    entity_type: "guest", entity_id: guest.id,
    metadata: body.data.action === "speaker_mode" ? { mode: body.data.mode } : {},
  });
  return apiSuccess({ data: { id: guest.id } });
}

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
