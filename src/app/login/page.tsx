import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";

export const metadata = {
  title: "Staff sign in",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="login-heading">
        <p className="eyebrow">GTP 2026 · Staff access</p>
        <h1 id="login-heading">Sign in to check-in</h1>
        <p className="lede">
          Use Google with an email approved by your event organizer, or request
          a secure email link.
        </p>
        <LoginForm
          accessDenied={error === "access-denied"}
          invalidLink={error === "invalid-link"}
        />
        <Link className="text-link" href="/">
          Return to platform overview
        </Link>
      </section>
    </main>
  );
}
