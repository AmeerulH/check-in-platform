import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api/response";
import { normalizeEmail } from "@/lib/auth/staff";
import { getPublicEnv } from "@/lib/env/public";
import { EVENT_ID } from "@/lib/event";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  email: z.email().transform(normalizeEmail),
});

const genericResponse = {
  code: "AUTH_LINK_REQUEST_ACCEPTED",
  message:
    "If your email is approved, a secure sign-in link will arrive shortly.",
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return apiError({
      code: "AUTH_INVALID_EMAIL",
      message: "Enter a valid email address and try again.",
      status: 400,
    });
  }

  const admin = createSupabaseAdminClient();
  const { data: membership, error: membershipError } = await admin
    .from("event_memberships")
    .select("id, auth_user_id")
    .eq("event_id", EVENT_ID)
    .eq("normalized_email", parsed.data.email)
    .eq("active", true)
    .maybeSingle();

  if (membershipError) {
    console.error("Unable to verify staff membership.", {
      code: membershipError.code,
    });
    return apiError({
      code: "AUTH_SERVICE_UNAVAILABLE",
      message: "Sign-in is temporarily unavailable. Please try again shortly.",
      status: 503,
    });
  }

  if (!membership) {
    return apiSuccess(genericResponse);
  }

  let authUserId = membership.auth_user_id;

  if (!authUserId) {
    const { data, error } = await admin.auth.admin.createUser({
      email: parsed.data.email,
      email_confirm: true,
    });

    if (error || !data.user) {
      console.error("Unable to create approved staff auth user.", {
        code: error?.code,
        status: error?.status,
      });
      return apiError({
        code: "AUTH_SERVICE_UNAVAILABLE",
        message: "Sign-in is temporarily unavailable. Please try again shortly.",
        status: 503,
      });
    }

    authUserId = data.user.id;
    const { error: linkError } = await admin
      .from("event_memberships")
      .update({ auth_user_id: authUserId })
      .eq("id", membership.id);

    if (linkError) {
      console.error("Unable to link approved staff auth user.", {
        code: linkError.code,
      });
      return apiError({
        code: "AUTH_SERVICE_UNAVAILABLE",
        message: "Sign-in is temporarily unavailable. Please try again shortly.",
        status: 503,
      });
    }
  }

  const env = getPublicEnv();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: new URL("/auth/callback", env.NEXT_PUBLIC_APP_URL).toString(),
    },
  });

  if (error) {
    console.error("Unable to send staff sign-in link.", {
      code: error.code,
      status: error.status,
    });

    if (error.status === 429 || /rate limit/i.test(error.message)) {
      return apiError({
        code: "AUTH_LINK_RATE_LIMITED",
        message:
          "We cannot send another sign-in link yet. Please wait about one hour, then try again.",
        retryAfterSeconds: 3600,
        status: 429,
      });
    }

    return apiError({
      code: "AUTH_DELIVERY_UNAVAILABLE",
      message:
        "We could not send the sign-in email. Please try again later or contact an organizer.",
      status: 503,
    });
  }

  return apiSuccess(genericResponse);
}
