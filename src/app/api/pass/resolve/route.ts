import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api/response";
import {
  createPassQrDataUrl,
  createPassUrl,
  digestCredentialToken,
} from "@/lib/credentials";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const passSchema = z.object({
  publicId: z.uuid(),
  token: z.string().regex(/^v1\.[A-Za-z0-9_-]{40,}$/),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = passSchema.safeParse(body);

  if (!parsed.success) {
    return apiError({
      code: "PASS_INVALID_OR_REVOKED",
      message: "This guest pass is invalid or is no longer active.",
      status: 404,
    });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("guest_credentials")
    .select("id, public_id, guest:guests!inner(display_name, status)")
    .eq("public_id", parsed.data.publicId)
    .eq("token_digest", digestCredentialToken(parsed.data.token))
    .is("revoked_at", null)
    .maybeSingle();

  const guest = Array.isArray(data?.guest) ? data.guest[0] : data?.guest;

  if (error || !data || !guest || guest.status !== "active") {
    return apiError({
      code: "PASS_INVALID_OR_REVOKED",
      message: "This guest pass is invalid or is no longer active.",
      status: 404,
    });
  }

  const passUrl = createPassUrl(data.public_id, parsed.data.token);

  return apiSuccess({
    data: {
      guestName: guest.display_name,
      passUrl,
      qrDataUrl: await createPassQrDataUrl(passUrl),
    },
  });
}
