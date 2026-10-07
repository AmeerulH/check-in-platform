import { apiError, apiSuccess } from "@/lib/api/response";
import { requireApiStaff } from "@/lib/auth/api";
import { syncRegistrationSheet } from "@/lib/registration-sync";
import { asSheetSyncError } from "@/lib/sheet-sync-error";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function run(actor: string | null) {
  try {
    return apiSuccess({ data: await syncRegistrationSheet(actor) });
  } catch (error) {
    console.error("Registration sync failed.", error);
    return apiError({ code: "IMPORT_UNAVAILABLE", message: asSheetSyncError(error).message, status: 503 });
  }
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return apiError({ code: "AUTH_ACCESS_DENIED", message: "Access denied.", status: 403 });
  }
  return run(null);
}

export async function POST() {
  const access = await requireApiStaff(["organizer"]);
  if (access.error) return access.error;
  return run(access.staffMember.id);
}
