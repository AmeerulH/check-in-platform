"use client";

import { Download, LoaderCircle, Mail, RefreshCw, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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

type PassLinkResponse = {
  data?: {
    passUrl?: string;
  };
};

type ErrorResponse = {
  error?: {
    code?: string;
    message?: string;
  };
};

export function GuestActions({ guestEmail, guestId, guestName }: GuestActionsProps) {
  const shareButtonRef = useRef<HTMLButtonElement>(null);
  const sharePopoverRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [action, setAction] = useState<"share" | "download" | "replace" | "delete" | null>(null);
  const [isPreparingShare, setIsPreparingShare] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmingReplacement, setConfirmingReplacement] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [passUrl, setPassUrl] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState("");
  const [sharePopoverPosition, setSharePopoverPosition] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(""), 5000);
    return () => window.clearTimeout(timeout);
  }, [message]);

  function showSharePopover() {
    window.requestAnimationFrame(() => {
      const trigger = shareButtonRef.current;
      if (!trigger) return;

      const bounds = trigger.getBoundingClientRect();
      const popoverWidth = Math.min(400, window.innerWidth - 32);
      setSharePopoverPosition({
        left: Math.max(16, Math.min(bounds.right - popoverWidth, window.innerWidth - popoverWidth - 16)),
        top: Math.min(bounds.bottom + 8, window.innerHeight - 176),
      });
      window.requestAnimationFrame(() => sharePopoverRef.current?.showPopover());
    });
  }

  async function createReplacementPass() {
    setAction("replace");
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

      setQrFile(await createQrFile(body.data.qrDataUrl));
      setPassUrl(body.data.passUrl);
      showSharePopover();
      router.refresh();
    } catch {
      setMessage("We could not reach the pass service. Please try again.");
    } finally {
      setAction(null);
      setConfirmingReplacement(false);
    }
  }

  const subject = "Your GTP 2026 QR pass";
  const emailBody = `Hello ${guestName},\n\nYour GTP 2026 QR pass is attached. Please keep it available on your phone and present it at registration.${passUrl ? `\n\nYou can also open your pass here: ${passUrl}` : ""}`;

  async function sharePass() {
    if (!qrFile || !navigator.share) return;

    try {
      setIsPreparingShare(true);
      if (!navigator.canShare?.({ files: [qrFile] })) {
        setShareMessage("This browser cannot attach files to the share sheet. Download the PNG, then attach it in your mail app.");
        return;
      }
      await navigator.share({
        title: subject,
        text: emailBody,
        files: [qrFile],
      });
    } catch {
      // Closing a native share sheet is an expected cancellation.
    } finally {
      setIsPreparingShare(false);
    }
  }

  async function createQrFile(qrDataUrl: string) {
    const blob = await fetch(qrDataUrl).then((response) => response.blob());
    return new File([blob], `GTP-2026-QR-pass-${guestName.replaceAll(/\W+/g, "-").toLowerCase()}.png`, {
      type: "image/png",
    });
  }

  async function openStoredPass() {
    setAction("share");
    setMessage("");
    try {
      const [response, linkResponse] = await Promise.all([
        fetch(`/api/guests/${guestId}/pass-file`),
        fetch(`/api/guests/${guestId}/pass-link`),
      ]);
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as ErrorResponse | null;
        setMessage(body?.error?.message ?? "We could not retrieve this QR file.");
        return;
      }

      const file = new File(
        [await response.blob()],
        `GTP-2026-QR-pass-${guestName.replaceAll(/\W+/g, "-").toLowerCase()}.png`,
        { type: "image/png" },
      );
      const linkBody = linkResponse.ok
        ? (await linkResponse.json()) as PassLinkResponse
        : null;
      setQrFile(file);
      setPassUrl(linkBody?.data?.passUrl ?? null);
      showSharePopover();
    } catch {
      setMessage("We could not retrieve this QR file. Check your connection and try again.");
    } finally {
      setAction(null);
    }
  }

  function triggerDownload(file: File) {
    const link = document.createElement("a");
    const downloadUrl = URL.createObjectURL(file);
    link.href = downloadUrl;
    link.download = file.name;
    link.click();
    URL.revokeObjectURL(downloadUrl);
  }

  function downloadQrFile() {
    if (!qrFile) return;
    triggerDownload(qrFile);
    setShareMessage("QR PNG downloaded. Attach it to your email before sending.");
  }

  async function downloadStoredPass() {
    setAction("download");
    setMessage("");
    try {
      const response = await fetch(`/api/guests/${guestId}/pass-file`);
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as ErrorResponse | null;
        setMessage(body?.error?.message ?? "We could not retrieve this QR file.");
        return;
      }

      const file = new File(
        [await response.blob()],
        `GTP-2026-QR-pass-${guestName.replaceAll(/\W+/g, "-").toLowerCase()}.png`,
        { type: "image/png" },
      );
      triggerDownload(file);
      setMessage("QR PNG downloaded.");
    } catch {
      setMessage("We could not retrieve this QR file. Check your connection and try again.");
    } finally {
      setAction(null);
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
      <button
        className="guest-action-button"
        disabled={action !== null}
        onClick={() => void openStoredPass()}
        ref={shareButtonRef}
        type="button"
      >
        {action === "share" ? <LoaderCircle aria-hidden="true" className="spin" size={16} /> : <Mail size={16} />}
        {action === "share" ? "Loading…" : "Share QR"}
      </button>
      <button
        aria-label={`Download QR for ${guestName}`}
        className="guest-download-button"
        disabled={action !== null}
        onClick={() => void downloadStoredPass()}
        title="Download QR PNG"
        type="button"
      >
        {action === "download" ? <LoaderCircle aria-hidden="true" className="spin" size={16} /> : <Download size={16} />}
      </button>
      {!confirmingReplacement ? (
        <button
          aria-label={`Regenerate QR for ${guestName}`}
          className="guest-regenerate-button"
          disabled={action !== null}
          onClick={() => {
            setMessage("");
            setQrFile(null);
            setConfirmingReplacement(true);
          }}
          title="Generate a new QR and invalidate the current pass"
          type="button"
        >
          <RefreshCw size={16} />
        </button>
      ) : (
        <span className="pass-replacement-confirmation">
          <span>New QR?</span>
          <button disabled={action !== null} onClick={createReplacementPass} type="button">
            {action === "replace" ? <LoaderCircle className="spin" size={16} /> : "Yes"}
          </button>
          <button disabled={action !== null} onClick={() => setConfirmingReplacement(false)} type="button">
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
      {message && typeof document !== "undefined" && createPortal(
        <div className="app-snackbar" role="status">
          <span>{message}</span>
          <button aria-label="Dismiss notification" onClick={() => setMessage("")} type="button">
            <X size={16} />
          </button>
        </div>,
        document.body,
      )}
      <div
        aria-labelledby={`share-pass-${guestId}`}
        className="guest-share-popover"
        popover="auto"
        ref={sharePopoverRef}
        role="dialog"
        style={sharePopoverPosition ?? undefined}
      >
        {qrFile && (
          <div>
            <button
              aria-label="Close sharing options"
              className="guest-share-close"
              onClick={() => {
                sharePopoverRef.current?.hidePopover();
                setQrFile(null);
                setPassUrl(null);
                setShareMessage("");
              }}
              type="button"
            >
              <X size={18} />
            </button>
            <strong id={`share-pass-${guestId}`}>Pass ready to share</strong>
            <p>Share the PNG directly, or download it first to attach it in an email.</p>
            <div className="guest-share-options">
              {typeof navigator !== "undefined" && "share" in navigator && (
                <button disabled={isPreparingShare} onClick={() => void sharePass()} type="button">
                  {isPreparingShare ? "Preparing QR…" : "Share QR file"}
                </button>
              )}
              <button onClick={downloadQrFile} type="button">
                <Download aria-hidden="true" size={16} />
                Download PNG
              </button>
              {passUrl && (
                <>
                  <a
                    href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(guestEmail)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Compose in Gmail
                  </a>
                  <a href={`mailto:${encodeURIComponent(guestEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`}>
                    Open mail app
                  </a>
                </>
              )}
            </div>
            <p className="guest-share-note">
              {passUrl
                ? "Compose options include the private pass link; attach the downloaded PNG before sending."
                : "This older QR can be attached, but needs one regeneration before its direct link can be shared."}
            </p>
            {shareMessage && <p className="guest-share-message" role="status">{shareMessage}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
