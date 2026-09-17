"use client";

import { LoaderCircle, Mail, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type GuestActionsProps = {
  guestId: string;
  guestName: string;
};

type ErrorResponse = {
  error?: {
    code?: string;
    message?: string;
  };
};

export function GuestActions({ guestId, guestName }: GuestActionsProps) {
  const router = useRouter();
  const [action, setAction] = useState<"email" | "delete" | null>(null);
  const [message, setMessage] = useState("");
  const [confirmingEmail, setConfirmingEmail] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function sendReplacementPass() {
    setAction("email");
    setMessage("");

    try {
      const response = await fetch(`/api/guests/${guestId}/send-pass`, {
        method: "POST",
      });
      const body = (await response.json()) as ErrorResponse;

      if (!response.ok) {
        setMessage(body.error?.message ?? "We could not send the QR pass. Please try again.");
        return;
      }

      setMessage(`A new QR pass was emailed to ${guestName}.`);
      router.refresh();
    } catch {
      setMessage("We could not reach the delivery service. Please try again.");
    } finally {
      setAction(null);
      setConfirmingEmail(false);
    }
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
      {!confirmingEmail ? (
        <button
          className="guest-action-button"
          disabled={action !== null}
          onClick={() => {
            setMessage("");
            setConfirmingEmail(true);
          }}
          title="Emails a new QR pass and invalidates the previous pass"
          type="button"
        >
          <Mail size={16} />
          Email new QR
        </button>
      ) : (
        <span className="delete-confirmation">
          <span>Replace QR?</span>
          <button disabled={action !== null} onClick={sendReplacementPass} type="button">
            {action === "email" ? <LoaderCircle className="spin" size={16} /> : "Yes"}
          </button>
          <button disabled={action !== null} onClick={() => setConfirmingEmail(false)} type="button">
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
    </div>
  );
}
