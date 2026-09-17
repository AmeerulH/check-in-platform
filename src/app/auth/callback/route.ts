import { NextResponse } from "next/server";

import { bindStaffMembership } from "@/lib/auth/staff";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=invalid-link", requestUrl.origin),
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  const email = data.session?.user.email;
  const userId = data.session?.user.id;
  const hasStaffAccess =
    !error &&
    typeof email === "string" &&
    typeof userId === "string" &&
    await bindStaffMembership({ email, userId });

  if (!hasStaffAccess) {
    await supabase.auth.signOut();
    return NextResponse.redirect(
      new URL("/login?error=access-denied", requestUrl.origin),
    );
  }

  return NextResponse.redirect(
    new URL("/dashboard?login=success", requestUrl.origin),
  );
}
