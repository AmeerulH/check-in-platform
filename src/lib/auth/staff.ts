import "server-only";

import { redirect } from "next/navigation";

import { EVENT_ID } from "@/lib/event";
import { isDevelopmentPreview, previewOrganizer } from "@/lib/auth/preview";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const STAFF_ROLES = ["organizer", "scanner", "viewer"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export type StaffMember = {
  id: string;
  auth_user_id: string | null;
  normalized_email: string;
  role: StaffRole;
  active: boolean;
};

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export async function getCurrentStaffMember(): Promise<StaffMember | null> {
  if (isDevelopmentPreview()) {
    return previewOrganizer;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: claimsData,
  } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;

  const userId = claims?.sub;
  const email = claims?.email;

  if (typeof userId !== "string" || typeof email !== "string") {
    return null;
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("event_memberships")
    .select("id, auth_user_id, normalized_email, role, active")
    .eq("event_id", EVENT_ID)
    .eq("normalized_email", normalizeEmail(email))
    .maybeSingle();

  if (error || !data || !data.active) {
    return null;
  }

  if (data.auth_user_id && data.auth_user_id !== userId) {
    return null;
  }

  return data as StaffMember;
}

export async function requireStaffMember(allowedRoles?: readonly StaffRole[]) {
  const member = await getCurrentStaffMember();

  if (!member || (allowedRoles && !allowedRoles.includes(member.role))) {
    redirect("/login");
  }

  return member;
}
