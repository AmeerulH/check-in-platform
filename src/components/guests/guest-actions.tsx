"use client";

import { LoaderCircle, Mail, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type GuestActionsProps = {
  guestEmail: string;
  guestId: string;
  guestName: string;
};

type CredentialResponse = {
  data?: {
    passUrl: string;
    qrDataUrl: string;
  };
};

type ErrorResponse = {
  error?: {
    code?: string;
    message?: string;
  };
};

export function GuestActions({ guestEmail, guestId, guestName }: GuestActionsProps) {
  const router = useRouter();
  const [action, setAction] = useState<"share" | "delete" | null>(null);
  const [message, setMessage] = useState("");
  const [confirmingShare, setConfirmingShare] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [passUrl, setPassUrl] = useState<string | null>(null);

  async function createReplacementPass() {
    setAction("share");
    setMessage("");

    try {
      const response = await fetch(`/api/guests/${guestId}/credential`, {
        method: "POST",
      });
      const body = (await response.json()) as CredentialResponse & ErrorResponse;

      if (!response.ok || !body.data) {
        setMessage(body.error?.message ?? "We could not create a new QR pass. Please try again.");
        return;
      }

      setPassUrl(body.data.passUrl);
      router.refresh();
    } catch {
      setMessage("We could not reach the pass service. Please try again.");
    } finally {
      setAction(null);
      setConfirmingShare(false);
    }
  }

  const subject = "Your GTP 2026 QR pass";
  const emailBody = passUrl
    ? `Hello ${guestName},\n\nYour GTP 2026 QR pass is ready. Open it here: ${passUrl}\n\nPlease keep this pass available on your phone and present its QR code at registration.`
    : "";

  async function sharePass() {
    if (!passUrl || !navigator.share) return;

    try {
      await navigator.share({ title: subject, text: emailBody, url: passUrl });
    } catch {
      // Closing a native share sheet is an expected cancellation.
    }
  }

  async function copyPassLink() {
    if (!passUrl) return;
    await navigator.clipboard.writeText(passUrl);
    setMessage("Pass link copied. You can paste it into any message.");
  }

  async function deleteGuest() {
    setAction("delete");
    setMessage("");

    try {
      const response = await fetch(`/api/guests/${guestId}`, {
        method: "DELETE",
      });
      const body = (await response.json()) as ErrorResponse;

      if (!response.ok) {
        setMessage(body.error?.message ?? "We could not delete this guest. Please try again.");
        return;
      }

      router.refresh();
    } catch {
      setMessage("We could not reach the guest service. Please try again.");
    } finally {
      setAction(null);
      setConfirmingDelete(false);
    }
  }

  return (
    <div className="guest-actions">
      {!confirmingShare ? (
        <button
          className="guest-action-button"
          disabled={action !== null}
          onClick={() => {
            setMessage("");
            setPassUrl(null);
            setConfirmingShare(true);
          }}
          title="Creates a new QR pass and invalidates the previous pass"
          type="button"
        >
          <Mail size={16} />
          Share QR
        </button>
      ) : (
        <span className="delete-confirmation">
          <span>Replace QR?</span>
          <button disabled={action !== null} onClick={createReplacementPass} type="button">
            {action === "share" ? <LoaderCircle className="spin" size={16} /> : "Yes"}
          </button>
          <button disabled={action !== null} onClick={() => setConfirmingShare(false)} type="button">
            No
          </button>
        </span>
      )}
      {!confirmingDelete ? (
        <button
          aria-label={`Delete ${guestName}`}
          className="guest-delete-button"
          disabled={action !== null}
          onClick={() => {
            setMessage("");
            setConfirmingDelete(true);
          }}
          title="Delete guest"
          type="button"
        >
          <Trash2 size={16} />
        </button>
      ) : (
        <span className="delete-confirmation">
          <span>Delete?</span>
          <button disabled={action !== null} onClick={deleteGuest} type="button">
            {action === "delete" ? "Deleting…" : "Yes"}
          </button>
          <button disabled={action !== null} onClick={() => setConfirmingDelete(false)} type="button">
            No
          </button>
        </span>
      )}
      {message && <p className="guest-action-message" role="status">{message}</p>}
      {passUrl && (
        <div className="guest-share-panel">
          <strong>Pass ready to share</strong>
          <p>The prior QR pass is no longer valid.</p>
          <div>
            {typeof navigator !== "undefined" && "share" in navigator && (
              <button onClick={sharePass} type="button">Share</button>
            )}
            <a
              href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(guestEmail)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`}
              rel="noreferrer"
              target="_blank"
            >
              Gmail
            </a>
            <a href={`mailto:${encodeURIComponent(guestEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`}>
              Mail app
            </a>
            <button onClick={copyPassLink} type="button">Copy link</button>
          </div>
        </div>
      )}
    </div>
  );
}
