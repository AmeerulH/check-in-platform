# Phase 2 — Supabase Setup

## Purpose

This phase introduces the database schema and staff authentication boundary.
The application cannot handle guests or check-ins yet.

## Apply the database migration

1. In Supabase, open the new `check-in-platform` project.
2. Copy its **project reference** from Project Settings.
3. From the project root, authenticate the Supabase CLI:

   ```bash
   npx supabase login
   ```

4. Link this repository to the project:

   ```bash
   npx supabase link --project-ref <project-reference>
   ```

5. Review and apply the version-controlled migration:

   ```bash
   npx supabase db push
   ```

The migration creates the data model, access-control policies, and GTP event
days for 12–15 October 2026. It does not create guest records.

## Configure the first organizer

Before running this command, fill these values in `.env.local`:

```text
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SECRET_KEY
BOOTSTRAP_ADMIN_EMAIL
```

Then run:

```bash
npm run bootstrap:admin
```

This creates the passwordless Supabase Auth user if necessary and gives the
configured email active `organizer` access for GTP 2026.

## Configure Supabase Auth

In Supabase Authentication settings:

- Set Site URL to `http://localhost:3000` during local testing.
- Add `http://localhost:3000/auth/callback` as an allowed redirect URL.
- After Vercel is deployed, add its production URL and
  `/auth/callback` redirect URL.
- Keep email/passwordless sign-in enabled.
- Do not expose the project secret key in browser code or dashboard
  screenshots.

Supabase's default email sender is adequate for one-person testing only. A
custom SMTP provider will be configured before inviting staff broadly.
