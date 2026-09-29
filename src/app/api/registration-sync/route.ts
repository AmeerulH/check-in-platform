import { apiError, apiSuccess } from "@/lib/api/response";
import { requireApiStaff } from "@/lib/auth/api";
import { syncRegistrationSheet } from "@/lib/registration-sync";

export const dynamic = "force-dynamic";

async function run(actor: string | null) {
  try {
    return apiSuccess({ data: await syncRegistrationSheet(actor) });
  } catch (error) {
    console.error("Registration sync failed.", error);
    return apiError({ code: "IMPORT_UNAVAILABLE", message: "Sheet sync could not finish. Check the connection and try again.", status: 503 });
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
