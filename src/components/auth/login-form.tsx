"use client";

import { FormEvent, useState } from "react";

type FormStatus = "idle" | "submitting" | "submitted" | "error";

type ApiErrorResponse = {
  error?: {
    code?: string;
    message?: string;
  };
};

export function LoginForm({ invalidLink = false }: { invalidLink?: boolean }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorCode, setErrorCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const hasError = status === "error" || (status === "idle" && invalidLink);

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

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <label htmlFor="email">Approved staff email</label>
      <input
        autoComplete="email"
        aria-describedby="login-feedback"
        disabled={status === "submitting"}
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
      <button disabled={status === "submitting"} type="submit">
        {status === "submitting" ? "Sending secure link…" : "Email me a sign-in link"}
      </button>
      <p
        aria-live="polite"
        className={`form-message ${
          hasError ? "status-error" : ""
        } ${status === "submitted" ? "status-success" : ""}`}
        id="login-feedback"
        role={hasError ? "alert" : "status"}
      >
        {invalidLink && status === "idle" &&
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
    </form>
  );
}
