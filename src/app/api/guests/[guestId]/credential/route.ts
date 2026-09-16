import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api/response";
import { requireApiStaff } from "@/lib/auth/api";
import {
  createCredentialToken,
  createPassQrDataUrl,
  createPassUrl,
  digestCredentialToken,
} from "@/lib/credentials";
import { EVENT_ID } from "@/lib/event";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const paramsSchema = z.object({ guestId: z.uuid() });

type IssuedCredential = {
  credential_id: string;
  public_id: string;
  version: number;
};

export async function POST(
  _request: Request,
  context: RouteContext<"/api/guests/[guestId]/credential">,
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
  const { data: guest, error: guestError } = await admin
    .from("guests")
    .select("id, display_name, status")
    .eq("id", parsedParams.data.guestId)
    .eq("event_id", EVENT_ID)
    .maybeSingle();

  if (guestError || !guest || guest.status !== "active") {
    return apiError({
      code: "GUEST_NOT_FOUND",
      message: "We could not find an active guest for this pass.",
      status: 404,
    });
  }

  const token = createCredentialToken();
  const { data: credentialResult, error: credentialError } = await admin.rpc(
    "issue_guest_credential",
    {
      target_guest_id: guest.id,
      next_token_digest: digestCredentialToken(token),
    },
  ).single();
  const credential = credentialResult as IssuedCredential | null;

  if (credentialError || !credential) {
    console.error("Unable to issue guest credential.", {
      code: credentialError?.code,
    });
    return apiError({
      code: "CREDENTIAL_ISSUE_FAILED",
      message: "We could not create the QR pass. Please try again.",
      status: 503,
    });
  }

  const passUrl = createPassUrl(credential.public_id, token);
  const qrDataUrl = await createPassQrDataUrl(passUrl);

  await admin.from("audit_events").insert({
    event_id: EVENT_ID,
    actor_membership_id: access.staffMember.id,
    action: "guest_credential.issued",
    entity_type: "guest_credential",
    entity_id: credential.credential_id,
    metadata: { guestId: guest.id, version: credential.version },
  });

  return apiSuccess({
    data: {
      guestName: guest.display_name,
      passUrl,
      publicId: credential.public_id,
      qrDataUrl,
      version: credential.version,
    },
  });
}
