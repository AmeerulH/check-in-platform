import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api/response";
import { requireApiStaff } from "@/lib/auth/api";
import { normalizeEmail, STAFF_ROLES } from "@/lib/auth/staff";
import { EVENT_ID } from "@/lib/event";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const staffSchema = z.object({
  email: z.email().transform(normalizeEmail),
  role: z.enum(STAFF_ROLES).default("organizer"),
});

export async function GET() {
  const access = await requireApiStaff(["organizer"]);
  if (access.error) return access.error;

  const { data, error } = await createSupabaseAdminClient()
    .from("event_memberships")
    .select("id, normalized_email, role, active, created_at")
    .eq("event_id", EVENT_ID)
    .order("created_at");

  if (error) {
    return apiError({
      code: "STAFF_SERVICE_UNAVAILABLE",
      message: "Staff access records are temporarily unavailable. Please try again shortly.",
      status: 503,
    });
  }

  return apiSuccess({ data: data ?? [] });
}

export async function POST(request: Request) {
  const access = await requireApiStaff(["organizer"]);
  if (access.error) return access.error;

  const body = await request.json().catch(() => null);
  const parsed = staffSchema.safeParse(body);
  if (!parsed.success) {
    return apiError({
      code: "STAFF_INVALID_INPUT",
      message: "Enter a valid staff email address and role.",
      status: 400,
    });
  }

  const admin = createSupabaseAdminClient();
  const { data: staffMember, error } = await admin
    .from("event_memberships")
    .insert({
      event_id: EVENT_ID,
      normalized_email: parsed.data.email,
      role: parsed.data.role,
      active: true,
    })
    .select("id, normalized_email, role, active")
    .single();

  if (error?.code === "23505") {
    return apiError({
      code: "STAFF_ALREADY_EXISTS",
      message: "This email already has staff access for this event.",
      status: 409,
    });
  }

  if (error || !staffMember) {
    console.error("Unable to add staff member.", { code: error?.code });
    return apiError({
      code: "STAFF_SERVICE_UNAVAILABLE",
      message: "We could not add this staff member. Please try again shortly.",
      status: 503,
    });
  }

  await admin.from("audit_events").insert({
    event_id: EVENT_ID,
    actor_membership_id: access.staffMember.id,
    action: "staff.added",
    entity_type: "event_membership",
    entity_id: staffMember.id,
    metadata: {
      addedEmail: staffMember.normalized_email,
      role: staffMember.role,
    },
  });

  return apiSuccess({ data: staffMember });
}
