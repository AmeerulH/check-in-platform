"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

type GuestResponse = {
  data: { id: string; display_name: string };
};

type CredentialResponse = {
  data: {
    guestName: string;
    passUrl: string;
    qrDataUrl: string;
    version: number;
  };
};

type ErrorResponse = { error?: { code?: string; message?: string } };

export function GuestFormPreview() {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [pass, setPass] = useState<CredentialResponse["data"] | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setStatus("saving");
    setMessage("");
    setErrorCode("");
    setPass(null);

    try {
      const guestResponse = await fetch("/api/guests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: form.get("name"),
          email: form.get("email"),
          organization: form.get("organization") || undefined,
          category: form.get("category") || undefined,
        }),
      });
      const guestBody = (await guestResponse.json()) as GuestResponse & ErrorResponse;

      if (!guestResponse.ok || !guestBody.data) {
        setStatus("error");
        setMessage(guestBody.error?.message ?? "We could not save this guest. Please try again.");
        setErrorCode(guestBody.error?.code ?? "GUEST_CREATE_FAILED");
        return;
      }

      const credentialResponse = await fetch(
        `/api/guests/${guestBody.data.id}/credential`,
        { method: "POST" },
      );
      const credentialBody =
        (await credentialResponse.json()) as CredentialResponse & ErrorResponse;

      if (!credentialResponse.ok || !credentialBody.data) {
        setStatus("saved");
        setMessage(
          `${guestBody.data.display_name} was saved, but the QR pass could not be created. You can retry from the guest list.`,
        );
        return;
      }

      setPass(credentialBody.data);
      setStatus("saved");
      setMessage(`${credentialBody.data.guestName} was saved and the QR pass is ready.`);
    } catch {
      setStatus("error");
      setMessage("We could not reach the guest service. Check your connection and try again.");
      setErrorCode("NETWORK_UNAVAILABLE");
    }
  }

  return (
    <div className="workspace">
      <header className="workspace-heading">
        <div>
          <p className="eyebrow">Guest directory</p>
          <h1>Add an invitee</h1>
          <p>Guest records use a normalized email to prevent duplicates.</p>
        </div>
      </header>
      <section className="form-panel">
        {status === "saved" && (
          <p className="status-message status-success" role="status">
            {message}
          </p>
        )}
        {status === "error" && (
          <p className="status-message status-error" role="alert">
            {message} Reference: {errorCode}.
          </p>
        )}
        <form className="guest-form" onSubmit={handleSubmit}>
          <label>
            Full name <span aria-hidden="true">*</span>
            <input name="name" required />
          </label>
          <label>
            Email address <span aria-hidden="true">*</span>
            <input autoComplete="email" name="email" required type="email" />
          </label>
          <label>
            Organization
            <input name="organization" />
          </label>
          <label>
            Guest category
            <select defaultValue="" name="category">
              <option disabled value="">Choose a category</option>
              <option>Delegate</option>
              <option>Speaker</option>
              <option>Partner</option>
              <option>Staff</option>
            </select>
          </label>
          <div className="form-actions">
            <Link className="button button-secondary" href="/admin/guests">
              Cancel
            </Link>
            <button disabled={status === "saving"} type="submit">
              {status === "saving" ? "Saving guest…" : "Save guest and create QR"}
            </button>
          </div>
        </form>
        {pass && (
          <section className="pass-result" aria-labelledby="pass-heading">
            <img alt={`QR pass for ${pass.guestName}`} src={pass.qrDataUrl} />
            <div>
              <h2 id="pass-heading">QR pass ready</h2>
              <p>Version {pass.version}. Copy or open this private pass link now. Reissuing a pass later invalidates this QR.</p>
              <a className="button button-primary" href={pass.passUrl} target="_blank">
                Open guest pass
              </a>
            </div>
          </section>
        )}
      </section>
    </div>
  );
}
