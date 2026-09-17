"use client";

import { LoaderCircle, Mail, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

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
  const shareDialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [action, setAction] = useState<"share" | "delete" | null>(null);
  const [isPreparingShare, setIsPreparingShare] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmingShare, setConfirmingShare] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [passUrl, setPassUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState("");

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
      setQrDataUrl(body.data.qrDataUrl);
      window.setTimeout(() => shareDialogRef.current?.showModal(), 0);
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
    if (!qrDataUrl || !navigator.share) return;

    try {
      setIsPreparingShare(true);
      const qrFile = await createQrFile();
      if (!qrFile || !navigator.canShare?.({ files: [qrFile] })) {
        setShareMessage("This browser cannot attach files to the share sheet. Download the PNG, then attach it in your mail app.");
        return;
      }
      await navigator.share({
        title: subject,
        text: `Hello ${guestName},\n\nYour GTP 2026 QR pass is attached. Please keep it available on your phone and present it at registration.`,
        files: [qrFile],
      });
    } catch {
      // Closing a native share sheet is an expected cancellation.
    } finally {
      setIsPreparingShare(false);
    }
  }

  async function createQrFile() {
    if (!qrDataUrl) return null;
    const blob = await fetch(qrDataUrl).then((response) => response.blob());
    return new File([blob], `GTP-2026-QR-pass-${guestName.replaceAll(/\W+/g, "-").toLowerCase()}.png`, {
      type: "image/png",
    });
  }

  function downloadQrFile() {
    if (!qrDataUrl) return;
    const link = document.createElement("a");
    link.href = qrDataUrl;
    link.download = `GTP-2026-QR-pass-${guestName.replaceAll(/\W+/g, "-").toLowerCase()}.png`;
    link.click();
    setShareMessage("QR PNG downloaded. Attach it to your email before sending.");
  }

  async function copyPassLink() {
    if (!passUrl) return;
    try {
      await navigator.clipboard.writeText(passUrl);
      setShareMessage("Pass link copied. You can paste it into any message.");
    } catch {
      setShareMessage("We could not copy the pass link. Choose a mail or sharing option instead.");
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
      <dialog
        aria-labelledby={`share-pass-${guestId}`}
        className="guest-share-dialog"
        onClose={() => {
          setPassUrl(null);
          setQrDataUrl(null);
          setShareMessage("");
        }}
        ref={shareDialogRef}
      >
        {passUrl && (
          <div>
            <button
              aria-label="Close sharing options"
              className="guest-share-close"
              onClick={() => shareDialogRef.current?.close()}
              type="button"
            >
              <X size={18} />
            </button>
            <strong id={`share-pass-${guestId}`}>Pass ready to share</strong>
          <p>The prior QR pass is no longer valid.</p>
            <div className="guest-share-options">
              {typeof navigator !== "undefined" && "share" in navigator && (
                <button disabled={isPreparingShare} onClick={() => void sharePass()} type="button">
                  {isPreparingShare ? "Preparing QR…" : "Share QR file"}
                </button>
              )}
              <button onClick={downloadQrFile} type="button">Download PNG</button>
              <a
                href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(guestEmail)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`}
                rel="noreferrer"
                target="_blank"
              >
                Gmail link
              </a>
              <a href={`mailto:${encodeURIComponent(guestEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`}>
                Mail app link
              </a>
              <button onClick={copyPassLink} type="button">Copy link</button>
            </div>
            {shareMessage && <p className="guest-share-message" role="status">{shareMessage}</p>}
          </div>
        )}
      </dialog>
    </div>
  );
}
