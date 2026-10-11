import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api/response";
import { requireApiStaff } from "@/lib/auth/api";
import { normalizeEmail } from "@/lib/auth/staff";
import { EVENT_ID } from "@/lib/event";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const paramsSchema = z.object({ guestId: z.uuid() });
const updateSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("speaker_mode"), mode: z.enum(["in_person", "virtual"]).nullable() }),
  z.object({ action: z.literal("mark_email_sent") }),
  z.object({
    action: z.literal("edit"),
    displayName: z.string().trim().min(2).max(120),
    email: z.email().transform(normalizeEmail),
    organization: z.string().trim().max(160),
    title: z.string().trim().max(160),
    ticketType: z.string().trim().max(120),
    category: z.string().trim().max(80),
    region: z.string().trim().max(120),
    country: z.string().trim().max(120),
  }),
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
  const input = body.data;
  const values = input.action === "speaker_mode"
    ? { speaker_mode: input.mode }
    : input.action === "edit"
      ? {
        display_name: input.displayName, normalized_email: input.email,
        organization: input.organization || null, title: input.title || null,
        ticket_type: input.ticketType || null, category: input.category || null,
        region: input.region || null, country: input.country || null,
        // Speaker attendance mode only applies to speakers.
        ...(input.category.toLowerCase() === "speaker" ? {} : { speaker_mode: null }),
      }
      : { email_marked_sent_at: new Date().toISOString(), email_marked_sent_by: access.staffMember.id };
  const { error } = await admin.from("guests").update(values).eq("id", guest.id).eq("event_id", EVENT_ID);
  if (error?.code === "23505") return apiError({ code: "GUEST_DUPLICATE_EMAIL", message: "That email is already used by another guest.", status: 409 });
  if (error) return apiError({ code: "AUTH_SERVICE_UNAVAILABLE", message: "Guest update failed.", status: 503 });
  await admin.from("audit_events").insert({ event_id: EVENT_ID, actor_membership_id: access.staffMember.id,
    action: input.action === "speaker_mode" ? "guest.speaker_mode_updated" : input.action === "edit" ? "guest.edited" : "guest.email_marked_sent",
    entity_type: "guest", entity_id: guest.id,
    metadata: input.action === "speaker_mode" ? { mode: input.mode } : input.action === "edit" ? { fields: Object.keys(values) } : {},
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
