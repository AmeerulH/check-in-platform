import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api/response";
import { requireApiStaff } from "@/lib/auth/api";
import { issueGuestPass } from "@/lib/pass-issuer";

const paramsSchema = z.object({ guestId: z.uuid() });

export async function POST(
  _request: Request,
  context: RouteContext<"/api/guests/[guestId]/credential">,
) {
  const access = await requireApiStaff(["organizer"]);
  if (access.error) return access.error;
  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success) return apiError({ code: "GUEST_NOT_FOUND", message: "We could not find this guest.", status: 404 });
  try {
    return apiSuccess({ data: await issueGuestPass(parsed.data.guestId, access.staffMember.id) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "CREDENTIAL_ISSUE_FAILED";
    return apiError({
      code: code === "GUEST_NOT_FOUND" ? "GUEST_NOT_FOUND" : code === "CREDENTIAL_FILE_STORE_FAILED" ? "CREDENTIAL_FILE_STORE_FAILED" : "CREDENTIAL_ISSUE_FAILED",
      message: code === "GUEST_NOT_FOUND" ? "We could not find an active guest for this pass." : "We could not create the QR pass. Please try again.",
      status: code === "GUEST_NOT_FOUND" ? 404 : 503,
    });
  }
}
