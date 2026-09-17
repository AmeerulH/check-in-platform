import { z } from "zod";

import { apiError } from "@/lib/api/response";
import { requireApiStaff } from "@/lib/auth/api";
import { EVENT_ID } from "@/lib/event";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const paramsSchema = z.object({ guestId: z.uuid() });

export async function GET(
  _request: Request,
  context: { params: Promise<{ guestId: string }> },
) {
  const access = await requireApiStaff(["organizer"]);
  if (access.error) return access.error;

  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return apiError({
      code: "GUEST_NOT_FOUND",
      message: "We could not find this guest.",
      status: 404,
    });
  }

  const admin = createSupabaseAdminClient();
  const { data: credential, error } = await admin
    .from("guest_credentials")
    .select("id, storage_path, guest:guests!inner(id, status, event_id)")
    .eq("guest_id", params.data.guestId)
    .is("revoked_at", null)
    .maybeSingle();
  const guest = Array.isArray(credential?.guest) ? credential.guest[0] : credential?.guest;

  if (error || !credential || !guest || guest.event_id !== EVENT_ID || guest.status !== "active") {
    return apiError({
      code: "GUEST_NOT_FOUND",
      message: "We could not find an active QR pass for this guest.",
      status: 404,
    });
  }

  if (!credential.storage_path) {
    return apiError({
      code: "PASS_FILE_UNAVAILABLE",
      message:
        "This QR was created before secure file storage was enabled. Generate a replacement pass once to make it shareable.",
      status: 404,
    });
  }

  const { data: passFile, error: fileError } = await admin.storage
    .from("guest-passes")
    .download(credential.storage_path);

  if (fileError || !passFile) {
    return apiError({
      code: "PASS_FILE_UNAVAILABLE",
      message:
        "We could not retrieve this QR file. Generate a replacement pass to create a new shareable copy.",
      status: 404,
    });
  }

  return new Response(passFile, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="GTP-2026-QR-pass-${params.data.guestId}.png"`,
      "Content-Type": "image/png",
    },
  });
}
