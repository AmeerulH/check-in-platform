import { createClient } from "@supabase/supabase-js";

const eventId = "3ca63df5-0a3a-452f-a38d-151020260001";

process.loadEnvFile(".env.local");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();

if (!url || !secretKey || !email) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, and BOOTSTRAP_ADMIN_EMAIL are required.",
  );
}

const supabase = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: existingMembership, error: membershipError } = await supabase
  .from("event_memberships")
  .select("id, auth_user_id")
  .eq("event_id", eventId)
  .eq("normalized_email", email)
  .maybeSingle();

if (membershipError) {
  throw membershipError;
}

let authUserId = existingMembership?.auth_user_id ?? null;

if (!authUserId) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
  });

  if (data.user) {
    authUserId = data.user.id;
  } else if (error?.code === "email_exists") {
    const { data: users, error: usersError } =
      await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existingUser = users.users.find((user) => user.email?.toLowerCase() === email);

    if (usersError || !existingUser) {
      throw usersError ?? error;
    }

    authUserId = existingUser.id;
  } else {
    throw error ?? new Error("Unable to create the bootstrap admin user.");
  }
}

const { error: upsertError } = await supabase
  .from("event_memberships")
  .upsert(
    {
      auth_user_id: authUserId,
      event_id: eventId,
      normalized_email: email,
      role: "organizer",
      active: true,
    },
    { onConflict: "event_id,normalized_email" },
  );

if (upsertError) {
  throw upsertError;
}

console.log(`Bootstrap organizer configured for ${email}.`);
