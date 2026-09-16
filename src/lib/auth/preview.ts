import "server-only";

import type { StaffMember } from "@/lib/auth/staff";

export function isDevelopmentPreview() {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.DEV_PREVIEW_MODE === "true"
  );
}

export const previewOrganizer: StaffMember = {
  id: "00000000-0000-0000-0000-000000000001",
  auth_user_id: null,
  normalized_email: "preview-organizer@localhost",
  role: "organizer",
  active: true,
};
