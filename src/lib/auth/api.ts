import { apiError } from "@/lib/api/response";
import { getCurrentStaffMember, type StaffMember, type StaffRole } from "@/lib/auth/staff";

export async function requireApiStaff(roles: readonly StaffRole[]) {
  const staffMember = await getCurrentStaffMember();

  if (!staffMember || !roles.includes(staffMember.role)) {
    return {
      error: apiError({
        code: "AUTH_ACCESS_DENIED",
        message: "Your staff access is unavailable for this action.",
        status: 403,
      }),
      staffMember: null,
    };
  }

  return { error: null, staffMember: staffMember as StaffMember };
}
