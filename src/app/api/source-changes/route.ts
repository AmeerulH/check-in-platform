import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api/response";
import { requireApiStaff } from "@/lib/auth/api";
import { EVENT_ID } from "@/lib/event";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({ changeId: z.uuid(), decision: z.enum(["apply", "dismiss"]) });

export async function PATCH(request: Request) {
  const access = await requireApiStaff(["organizer"]);
  if (access.error) return access.error;
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return apiError({ code: "GUEST_INVALID_INPUT", message: "Choose a valid review action.", status: 400 });
  const admin = createSupabaseAdminClient();
  const { data: change } = await admin.from("guest_source_changes")
    .select("id, guest_id").eq("id", body.data.changeId).eq("event_id", EVENT_ID).eq("status", "pending").maybeSingle();
  if (!change) return apiError({ code: "IMPORT_CHANGE_NOT_FOUND", message: "This change is no longer pending.", status: 404 });
  if (body.data.decision === "apply") {
    const { data, error } = await admin.rpc("apply_guest_source_change", {
      target_change_id: body.data.changeId, reviewer_id: access.staffMember.id,
    });
    if (error || !data) return apiError({ code: "IMPORT_UNAVAILABLE", message: "Could not apply this change.", status: 503 });
  } else {
    const { error } = await admin.from("guest_source_changes")
      .update({ status: "dismissed", reviewed_at: new Date().toISOString(), reviewed_by: access.staffMember.id })
      .eq("id", body.data.changeId).eq("status", "pending");
    if (error) return apiError({ code: "IMPORT_UNAVAILABLE", message: "Could not dismiss this change.", status: 503 });
  }
  await admin.from("audit_events").insert({ event_id: EVENT_ID, actor_membership_id: access.staffMember.id,
    action: `guest.source_change_${body.data.decision}`, entity_type: "guest", entity_id: change.guest_id,
    metadata: { changeId: body.data.changeId } });
  return apiSuccess({ data: { decision: body.data.decision } });
}
