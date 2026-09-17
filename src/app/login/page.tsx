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
          Continue with Google using an email an organizer has already added to
          staff access.
        </p>
        <LoginForm accessDenied={error === "access-denied"} />
        <Link className="text-link" href="/">
          Return to platform overview
        </Link>
      </section>
    </main>
  );
}
