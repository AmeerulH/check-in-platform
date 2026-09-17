"use client";

import { useEffect, useState } from "react";

type PassState =
  | { status: "loading" }
  | { status: "ready"; guestName: string; qrDataUrl: string }
  | { status: "error"; message: string; code: string };

export function GuestPass({ publicId }: { publicId: string }) {
  const [state, setState] = useState<PassState>({ status: "loading" });

  useEffect(() => {
    const token = window.location.hash.slice(1);

    fetch("/api/pass/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicId, token }),
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || !body.data) {
          throw body.error ?? {
            code: "PASS_INVALID_OR_REVOKED",
            message: "This guest pass is invalid or is no longer active.",
          };
        }
        return body.data;
      })
      .then((data) => {
        setState({
          status: "ready",
          guestName: data.guestName,
          qrDataUrl: data.qrDataUrl,
        });
      })
      .catch((error) => {
        setState({
          status: "error",
          code: error.code ?? "PASS_UNAVAILABLE",
          message: error.message ?? "We could not load this guest pass.",
        });
      });
  }, [publicId]);

  if (state.status === "loading") {
    return (
      <main className="pass-shell">
        <section className="pass-card" aria-live="polite">
          <p className="eyebrow">GTP 2026 guest pass</p>
          <h1>Loading your pass</h1>
          <div aria-hidden="true" className="pass-skeleton">
            <span className="skeleton" />
            <span className="skeleton" />
            <span className="skeleton pass-skeleton-qr" />
          </div>
          <p className="lede">Please keep this page open while we verify your secure pass.</p>
        </section>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="pass-shell">
        <section className="pass-card">
          <p className="eyebrow">GTP 2026 guest pass</p>
          <h1>Pass unavailable</h1>
          <p className="status-message status-error" role="alert">
            {state.message} Reference: {state.code}.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="pass-shell">
      <section className="pass-card">
        <p className="eyebrow">Global Tipping Points 2026</p>
        <h1>{state.guestName}</h1>
        <p className="lede">Present this QR code at registration from 12–15 October.</p>
        <img className="pass-qr" alt={`GTP guest pass for ${state.guestName}`} src={state.qrDataUrl} />
        <p className="pass-note">Keep this pass private. It is valid throughout the event.</p>
        <button className="button button-secondary" onClick={() => window.print()} type="button">
          Print pass
        </button>
      </section>
    </main>
  );
}
