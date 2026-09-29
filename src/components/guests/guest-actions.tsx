"use client";

import { Download, LoaderCircle, Mail, RefreshCw, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type GuestActionsProps = {
  guestEmail: string;
  guestId: string;
  guestName: string;
  ticketType: string | null;
  emailMarkedSentAt?: string | null;
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

export function GuestActions({ guestEmail, guestId, guestName, ticketType, emailMarkedSentAt }: GuestActionsProps) {
  const isOnline = /\bonline\b/i.test(ticketType ?? "");
  const shareButtonRef = useRef<HTMLButtonElement>(null);
  const sharePopoverRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [action, setAction] = useState<"share" | "download" | "replace" | "delete" | null>(null);
  const [isPreparingShare, setIsPreparingShare] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmingReplacement, setConfirmingReplacement] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [guideFile, setGuideFile] = useState<File | null>(null);
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
      const guideResponse = await fetch("/api/guide");
      setGuideFile(guideResponse.ok ? new File([await guideResponse.blob()], "GTP-2026-participant-guide.pdf", { type: "application/pdf" }) : null);
      setShareMessage(guideResponse.ok ? "" : "Attach the participant guide yourself if needed.");
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

  const subject = isOnline ? "Your GTP 2026 online registration" : "Your GTP 2026 QR pass";
  const emailBody = `Hello ${guestName},\n\nHere are your individual GTP 2026 registration details${passUrl ? `: ${passUrl}` : "."}\n\n${isOnline ? "You are registered for online participation. No QR code is needed." : "Please find your QR pass attached. You can use it if you visit the conference on site from 12–15 October."}`;

  async function sharePass() {
    if (!qrFile || !navigator.share) return;

    try {
      setIsPreparingShare(true);
      const files = guideFile ? [qrFile, guideFile] : [qrFile];
      if (!navigator.canShare?.({ files })) {
        setShareMessage("This browser cannot add the files to the share sheet. Download the QR, then attach it in your mail app.");
        return;
      }
      await navigator.share({
        title: subject,
        text: emailBody,
        files,
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
      const [response, linkResponse, guideResponse] = await Promise.all([
        isOnline ? Promise.resolve(null) : fetch(`/api/guests/${guestId}/pass-file`),
        fetch(`/api/guests/${guestId}/pass-link`),
        fetch("/api/guide"),
      ]);
      if (!isOnline && !response?.ok) {
        const body = (await response?.json().catch(() => null)) as ErrorResponse | null;
        setMessage(body?.error?.message ?? "We could not retrieve this QR file.");
        return;
      }

      const linkBody = linkResponse.ok
        ? (await linkResponse.json()) as PassLinkResponse
        : null;
      if (isOnline && !linkBody?.data?.passUrl) {
        setMessage("We could not retrieve this guest’s registration link.");
        return;
      }
      setQrFile(response ? new File(
        [await response.blob()],
        `GTP-2026-QR-pass-${guestName.replaceAll(/\W+/g, "-").toLowerCase()}.png`,
        { type: "image/png" },
      ) : null);
      setGuideFile(guideResponse.ok ? new File([await guideResponse.blob()], "GTP-2026-participant-guide.pdf", { type: "application/pdf" }) : null);
      setPassUrl(linkBody?.data?.passUrl ?? null);
      setShareMessage(guideResponse.ok ? "" : "Attach the participant guide yourself if needed.");
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

  function downloadGuideFile() {
    if (!guideFile) return;
    triggerDownload(guideFile);
    setShareMessage("Guide downloaded. Attach it yourself if needed.");
  }

  async function markEmailSent() {
    setAction("share");
    try {
      const response = await fetch(`/api/guests/${guestId}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_email_sent" }) });
      const body = await response.json() as ErrorResponse;
      if (!response.ok) throw new Error(body.error?.message ?? "Could not mark this email sent.");
      setMessage("Marked as sent by staff. Delivery is not verified by the website.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not mark this email sent."); }
    finally { setAction(null); }
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
        {action === "share" ? "Loading…" : "Share"}
      </button>
      {!isOnline && <button
        aria-label={`Download QR for ${guestName}`}
        className="guest-download-button"
        disabled={action !== null}
        onClick={() => void downloadStoredPass()}
        title="Download QR PNG"
        type="button"
      >
        {action === "download" ? <LoaderCircle aria-hidden="true" className="spin" size={16} /> : <Download size={16} />}
      </button>}
      {!isOnline && (!confirmingReplacement ? (
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
      ))}
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
            {action === "delete" && <LoaderCircle aria-hidden="true" className="spin" size={16} />}
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
        {(qrFile || passUrl) && (
          <div>
            <button
              aria-label="Close sharing options"
              className="guest-share-close"
              onClick={() => {
                sharePopoverRef.current?.hidePopover();
                setQrFile(null);
                setGuideFile(null);
                setPassUrl(null);
                setShareMessage("");
              }}
              type="button"
            >
              <X size={18} />
            </button>
            <strong id={`share-pass-${guestId}`}>Registration ready to share</strong>
            <p>{isOnline ? "Open your mail app to send this guest’s individual online registration details. Add the guide yourself if needed." : "Download this guest’s QR, open your mail app, and attach the QR and any guide you are sending before you send the email."}</p>
            <div className="guest-share-options">
              {qrFile && typeof navigator !== "undefined" && "share" in navigator && (
                <button disabled={isPreparingShare} onClick={() => void sharePass()} type="button">
                  {isPreparingShare ? "Preparing files…" : guideFile ? "Share QR and guide" : "Share QR"}
                </button>
              )}
              {qrFile && <button onClick={downloadQrFile} type="button">
                <Download aria-hidden="true" size={16} />
                Download PNG
              </button>}
              {guideFile && <button onClick={downloadGuideFile} type="button"><Download aria-hidden="true" size={16} />Download guide PDF</button>}
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
                ? isOnline ? "Compose links include this guest’s private registration link. No QR attachment is needed." : "Compose links include this guest’s private pass link. Attach the downloaded QR yourself in the mail app, plus any guide your team is sending."
                : "This older QR can be attached, but needs one regeneration before its direct link can be shared."}
            </p>
            <button disabled={action !== null || Boolean(emailMarkedSentAt)} onClick={() => void markEmailSent()} type="button">
              {action === "share" && <LoaderCircle aria-hidden="true" className="spin" size={16} />}
              {action === "share" ? "Marking sent…" : emailMarkedSentAt ? "Email marked sent" : "Mark email sent after sending"}
            </button>
            {shareMessage && <p className="guest-share-message" role="status">{shareMessage}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
