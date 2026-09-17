import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api/response";
import { requireApiStaff } from "@/lib/auth/api";
import { STAFF_ROLES } from "@/lib/auth/staff";
import { EVENT_ID } from "@/lib/event";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const paramsSchema = z.object({ staffId: z.uuid() });
const roleSchema = z.object({ role: z.enum(STAFF_ROLES) });

export async function PATCH(
  request: Request,
  context: { params: Promise<{ staffId: string }> },
) {
  const access = await requireApiStaff(["organizer"]);
  if (access.error) return access.error;

  const params = paramsSchema.safeParse(await context.params);
  const body = roleSchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) {
    return apiError({
      code: "STAFF_INVALID_INPUT",
      message: "Choose a valid staff member and role.",
      status: 400,
    });
  }

  const admin = createSupabaseAdminClient();
  const { data: target, error: targetError } = await admin
    .from("event_memberships")
    .select("id, normalized_email, role, active")
    .eq("id", params.data.staffId)
    .eq("event_id", EVENT_ID)
    .maybeSingle();

  if (targetError || !target) {
    return apiError({
      code: "STAFF_NOT_FOUND",
      message: "We could not find this staff member.",
      status: 404,
    });
  }

  if (target.id === access.staffMember.id && body.data.role !== "organizer") {
    return apiError({
      code: "STAFF_SELF_ROLE_PROTECTED",
      message: "You cannot remove your own organizer access.",
      status: 403,
    });
  }

  if (target.active && target.role === "organizer" && body.data.role !== "organizer") {
    const { count, error: countError } = await admin
      .from("event_memberships")
      .select("*", { count: "exact", head: true })
      .eq("event_id", EVENT_ID)
      .eq("role", "organizer")
      .eq("active", true);

    if (countError || (count ?? 0) <= 1) {
      return apiError({
        code: "STAFF_LAST_ORGANIZER_PROTECTED",
        message: "Keep at least one active organizer for this event.",
        status: 409,
      });
    }
  }

  const { data: updatedStaffMember, error: updateError } = await admin
    .from("event_memberships")
    .update({ role: body.data.role })
    .eq("id", target.id)
    .select("id, normalized_email, role, active")
    .single();

  if (updateError || !updatedStaffMember) {
    return apiError({
      code: "STAFF_SERVICE_UNAVAILABLE",
      message: "We could not update this staff role. Please try again shortly.",
      status: 503,
    });
  }

  await admin.from("audit_events").insert({
    event_id: EVENT_ID,
    actor_membership_id: access.staffMember.id,
    action: "staff.role_changed",
    entity_type: "event_membership",
    entity_id: target.id,
    metadata: {
      staffEmail: target.normalized_email,
      previousRole: target.role,
      nextRole: updatedStaffMember.role,
    },
  });

  return apiSuccess({ data: updatedStaffMember });
}
