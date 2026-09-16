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
          Use the email address approved by your event organizer. We will send
          you a secure sign-in link.
        </p>
        <LoginForm invalidLink={error === "invalid-link"} />
        <Link className="text-link" href="/">
          Return to platform overview
        </Link>
      </section>
    </main>
  );
}
