import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api/response";
import { requireApiStaff } from "@/lib/auth/api";
import { getAttendanceLog } from "@/lib/attendance";

const querySchema = z.object({
  date: z.iso.date().optional(),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
  search: z.string().trim().max(120).optional(),
});

export async function GET(request: Request) {
  const access = await requireApiStaff(["organizer", "scanner", "viewer"]);
  if (access.error) return access.error;

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    date: url.searchParams.get("date") || undefined,
    offset: url.searchParams.get("offset") || undefined,
    search: url.searchParams.get("search") || undefined,
  });

  if (!parsed.success) {
    return apiError({
      code: "ATTENDANCE_INVALID_FILTER",
      message: "Use a valid date and search term.",
      status: 400,
    });
  }

  try {
    return apiSuccess({
      data: await getAttendanceLog(parsed.data),
    });
  } catch {
    return apiError({
      code: "ATTENDANCE_UNAVAILABLE",
      message: "Check-in records are temporarily unavailable. Please try again shortly.",
      status: 503,
    });
  }
}
