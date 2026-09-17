"use client";

import { useEffect, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function LoginForm({
  accessDenied = false,
}: {
  accessDenied?: boolean;
}) {
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorCode, setErrorCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const hasError = Boolean(errorMessage) || accessDenied;

  useEffect(() => {
    function resetLoading() {
      setGoogleLoading(false);
    }

    window.addEventListener("pageshow", resetLoading);
    window.addEventListener("focus", resetLoading);
    return () => {
      window.removeEventListener("pageshow", resetLoading);
      window.removeEventListener("focus", resetLoading);
    };
  }, []);

  async function signInWithGoogle() {
    setGoogleLoading(true);
    setErrorCode("");
    setErrorMessage("");

    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          skipBrowserRedirect: true,
          queryParams: {
            prompt: "select_account",
            access_type: "online",
          },
        },
      });

      if (error || !data.url) {
        setGoogleLoading(false);
        setErrorCode("GOOGLE_SIGN_IN_UNAVAILABLE");
        setErrorMessage("Google sign-in could not start. Please try again.");
        return;
      }

      window.location.assign(data.url);
    } catch {
      setGoogleLoading(false);
      setErrorCode("GOOGLE_SIGN_IN_UNAVAILABLE");
      setErrorMessage("Google sign-in could not start. Check your connection and try again.");
    }
  }

  return (
    <div>
      <button
        className="google-sign-in"
        disabled={googleLoading}
        onClick={() => void signInWithGoogle()}
        type="button"
      >
        <span aria-hidden="true" className="google-mark">G</span>
        {googleLoading ? "Opening Google…" : accessDenied ? "Continue with a different Google account" : "Continue with Google"}
      </button>
      <p
        aria-live="polite"
        className={`form-message ${hasError ? "status-error" : ""}`}
        id="login-feedback"
        role={hasError ? "alert" : "status"}
      >
        {accessDenied && !errorMessage &&
          "This Google account is not on the staff list. Ask an organizer to add that exact email, then choose it again."}
        {errorMessage}
        {errorCode && (
          <>
            {" "}
            Reference: {errorCode}.
          </>
        )}
      </p>
    </div>
  );
}
