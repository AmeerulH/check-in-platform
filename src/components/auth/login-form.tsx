"use client";

import { FormEvent, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type FormStatus = "idle" | "submitting" | "submitted" | "error";

type ApiErrorResponse = {
  error?: {
    code?: string;
    message?: string;
  };
};

export function LoginForm({
  accessDenied = false,
  invalidLink = false,
}: {
  accessDenied?: boolean;
  invalidLink?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<FormStatus>("idle");
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorCode, setErrorCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const hasError =
    status === "error" || (status === "idle" && (invalidLink || accessDenied));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setErrorCode("");
    setErrorMessage("");

    try {
      const response = await fetch("/api/auth/request-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as ApiErrorResponse | null;
        setErrorMessage(
          body?.error?.message ??
            "We could not request a sign-in link. Please try again.",
        );
        setErrorCode(body?.error?.code ?? "AUTH_REQUEST_FAILED");
        setStatus("error");
        return;
      }

      setStatus("submitted");
    } catch {
      setErrorMessage(
        "We could not reach the sign-in service. Check your connection and try again.",
      );
      setErrorCode("NETWORK_UNAVAILABLE");
      setStatus("error");
    }
  }

  async function signInWithGoogle() {
    setGoogleLoading(true);
    setErrorCode("");
    setErrorMessage("");

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setGoogleLoading(false);
      setStatus("error");
      setErrorCode("GOOGLE_SIGN_IN_UNAVAILABLE");
      setErrorMessage(
        "Google sign-in is not available yet. Try a magic link or contact an organizer.",
      );
    }
  }

  return (
    <div>
      <button
        className="google-sign-in"
        disabled={googleLoading || status === "submitting"}
        onClick={() => void signInWithGoogle()}
        type="button"
      >
        <span aria-hidden="true" className="google-mark">G</span>
        {googleLoading ? "Opening Google…" : "Continue with Google"}
      </button>
      <div className="auth-divider"><span>or use an email link</span></div>
      <form className="login-form" onSubmit={handleSubmit}>
        <label htmlFor="email">Approved staff email</label>
        <input
          autoComplete="email"
          aria-describedby="login-feedback"
          disabled={status === "submitting" || googleLoading}
          id="email"
          name="email"
          onChange={(event) => {
            setEmail(event.target.value);
            if (status === "error") {
              setStatus("idle");
              setErrorCode("");
              setErrorMessage("");
            }
          }}
          required
          type="email"
          value={email}
        />
        <button disabled={status === "submitting" || googleLoading} type="submit">
          {status === "submitting" ? "Sending secure link…" : "Email me a sign-in link"}
        </button>
      </form>
      <p
        aria-live="polite"
        className={`form-message ${
          hasError ? "status-error" : ""
        } ${status === "submitted" ? "status-success" : ""}`}
        id="login-feedback"
        role={hasError ? "alert" : "status"}
      >
        {accessDenied && status === "idle" &&
          "This Google account is not approved for staff access. Ask an organizer to add your exact email."}
        {invalidLink && !accessDenied && status === "idle" &&
          "This sign-in link is invalid or has expired. Request a new one and open it only once."}
        {status === "submitted" &&
          "If your email is approved, a secure sign-in link will arrive shortly."}
        {status === "error" && errorMessage}
        {status === "error" && errorCode && (
          <>
            {" "}
            Reference: {errorCode}.
          </>
        )}
      </p>
    </div>
  );
}
