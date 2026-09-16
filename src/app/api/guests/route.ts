import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api/response";
import { requireApiStaff } from "@/lib/auth/api";
import { normalizeEmail } from "@/lib/auth/staff";
import { EVENT_ID } from "@/lib/event";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const guestSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  email: z.email().transform(normalizeEmail),
  organization: z.string().trim().max(160).optional(),
  category: z.string().trim().max(80).optional(),
});

export async function GET() {
  const access = await requireApiStaff(["organizer"]);
  if (access.error) return access.error;

  const { data, error } = await createSupabaseAdminClient()
    .from("guests")
    .select("id, display_name, normalized_email, organization, category, status, created_at")
    .eq("event_id", EVENT_ID)
    .order("created_at", { ascending: false });

  if (error) {
    return apiError({
      code: "AUTH_SERVICE_UNAVAILABLE",
      message: "Guest records are temporarily unavailable. Please try again shortly.",
      status: 503,
    });
  }

  return apiSuccess({ data: data ?? [] });
}

export async function POST(request: Request) {
  const access = await requireApiStaff(["organizer"]);
  if (access.error) return access.error;

  const body = await request.json().catch(() => null);
  const parsed = guestSchema.safeParse(body);

  if (!parsed.success) {
    return apiError({
      code: "GUEST_INVALID_INPUT",
      message: "Enter a full name and valid email address.",
      status: 400,
    });
  }

  const { data, error } = await createSupabaseAdminClient()
    .from("guests")
    .insert({
      event_id: EVENT_ID,
      display_name: parsed.data.displayName,
      normalized_email: parsed.data.email,
      organization: parsed.data.organization || null,
      category: parsed.data.category || null,
    })
    .select("id, display_name, normalized_email, organization, category, status")
    .single();

  if (error?.code === "23505") {
    return apiError({
      code: "GUEST_DUPLICATE_EMAIL",
      message: "A guest with this email address is already on the invitee list.",
      status: 409,
    });
  }

  if (error || !data) {
    console.error("Unable to create guest.", { code: error?.code });
    return apiError({
      code: "AUTH_SERVICE_UNAVAILABLE",
      message: "We could not save this guest. Please try again shortly.",
      status: 503,
    });
  }

  await createSupabaseAdminClient().from("audit_events").insert({
    event_id: EVENT_ID,
    actor_membership_id: access.staffMember.id,
    action: "guest.created",
    entity_type: "guest",
    entity_id: data.id,
  });

  return apiSuccess({ data });
}
