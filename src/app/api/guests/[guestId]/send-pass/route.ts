import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api/response";
import { requireApiStaff } from "@/lib/auth/api";
import {
  createCredentialToken,
  createPassUrl,
  digestCredentialToken,
} from "@/lib/credentials";
import { getServerEnv } from "@/lib/env/server";
import { EVENT_ID } from "@/lib/event";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const paramsSchema = z.object({ guestId: z.uuid() });

type IssuedCredential = {
  credential_id: string;
  public_id: string;
  version: number;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character];
  });
}

export async function POST(
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

  const serverEnv = getServerEnv();
  if (!serverEnv.RESEND_API_KEY || !serverEnv.RESEND_FROM) {
    return apiError({
      code: "PASS_EMAIL_NOT_CONFIGURED",
      message:
        "Email delivery is not configured yet. Add a verified Resend sender address and API key before sending QR passes.",
      status: 503,
    });
  }

  const admin = createSupabaseAdminClient();
  const { data: guest, error: guestError } = await admin
    .from("guests")
    .select("id, display_name, normalized_email, status")
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
  const { data: credentialResult, error: credentialError } = await admin
    .rpc("issue_guest_credential", {
      target_guest_id: guest.id,
      next_token_digest: digestCredentialToken(token),
    })
    .single();
  const credential = credentialResult as IssuedCredential | null;

  if (credentialError || !credential) {
    console.error("Unable to issue guest credential for delivery.", {
      code: credentialError?.code,
    });
    return apiError({
      code: "CREDENTIAL_ISSUE_FAILED",
      message: "We could not create a new QR pass. Please try again.",
      status: 503,
    });
  }

  const passUrl = createPassUrl(credential.public_id, token);
  const guestName = escapeHtml(guest.display_name);
  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serverEnv.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: serverEnv.RESEND_FROM,
      to: [guest.normalized_email],
      subject: "Your GTP 2026 QR pass",
      html: `
        <p>Hello ${guestName},</p>
        <p>Your GTP 2026 QR pass is ready. Please keep this pass available on your phone and present its QR code at registration.</p>
        <p><a href="${passUrl}">Open your QR pass</a></p>
        <p>This is your current pass. If a new one is sent later, this link will stop working.</p>
      `,
      text: `Hello ${guest.display_name},\n\nYour GTP 2026 QR pass is ready. Open it here: ${passUrl}\n\nPlease keep the pass available on your phone and present its QR code at registration. If a new pass is sent later, this link will stop working.`,
    }),
  }).catch(() => null);

  if (!emailResponse?.ok) {
    console.error("Unable to send guest pass email.", {
      status: emailResponse?.status,
    });
    return apiError({
      code: "PASS_EMAIL_SEND_FAILED",
      message:
        "The previous QR pass was replaced, but we could not send the email. Check the delivery configuration and send a new replacement pass.",
      status: 503,
    });
  }

  const providerResult = (await emailResponse.json().catch(() => null)) as {
    id?: string;
  } | null;
  await admin.from("audit_events").insert({
    event_id: EVENT_ID,
    actor_membership_id: access.staffMember.id,
    action: "guest_pass.email_sent",
    entity_type: "guest_credential",
    entity_id: credential.credential_id,
    metadata: {
      guestId: guest.id,
      recipient: guest.normalized_email,
      version: credential.version,
      providerMessageId: providerResult?.id,
    },
  });

  return apiSuccess({
    data: {
      guestName: guest.display_name,
      recipient: guest.normalized_email,
    },
  });
}
