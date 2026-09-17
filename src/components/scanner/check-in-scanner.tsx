"use client";

import { BrowserQRCodeReader } from "@zxing/browser";
import { Camera, Keyboard, RefreshCw, SquareStop } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";

import {
  addPendingScan,
  getPendingScans,
  removePendingScan,
  type PendingScan,
} from "@/lib/scanner/pending-scans";

type ScannerStatus = "idle" | "requesting" | "scanning" | "submitting" | "success" | "repeat" | "pending" | "error";

type CheckInResponse = {
  data?: {
    guest_name: string;
    outcome: "valid_first" | "valid_repeat";
    scan_count: number;
    received_at: string;
  };
  error?: {
    code?: string;
    message?: string;
    retryable?: boolean;
  };
};

type ScannerControls = { stop: () => void };

function deviceLabel() {
  const storageKey = "gtp-scanner-device-label";
  const existing = window.localStorage.getItem(storageKey);
  if (existing) return existing;

  const label = `Web scanner ${crypto.randomUUID().slice(0, 8)}`;
  window.localStorage.setItem(storageKey, label);
  return label;
}

export function CheckInScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<ScannerControls | null>(null);
  const lockedRef = useRef(false);
  const retryPendingScansRef = useRef<() => Promise<void>>(async () => {});
  const [manualPass, setManualPass] = useState("");
  const [result, setResult] = useState<CheckInResponse["data"]>();
  const [message, setMessage] = useState("Start the camera, then hold a GTP QR pass inside the frame.");
  const [pendingCount, setPendingCount] = useState(0);
  const [status, setStatus] = useState<ScannerStatus>("idle");

  function stopCamera() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    const stream = videoRef.current?.srcObject;
    if (stream instanceof MediaStream) {
      stream.getTracks().forEach((track) => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    }
  }

  async function refreshPendingCount() {
    setPendingCount((await getPendingScans()).length);
  }

  async function submitPass(payload: string, pendingScan?: PendingScan) {
    if (lockedRef.current) return;
    lockedRef.current = true;
    stopCamera();
    setResult(undefined);
    setStatus("submitting");
    setMessage("Confirming this pass with the check-in service…");
    const scan = pendingScan ?? {
      payload,
      clientScanId: crypto.randomUUID(),
      deviceLabel: deviceLabel(),
      capturedAt: new Date().toISOString(),
    };

    try {
      const response = await fetch("/api/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payload: scan.payload,
          clientScanId: scan.clientScanId,
          deviceLabel: scan.deviceLabel,
          capturedAt: scan.capturedAt,
        }),
      });
      const body = (await response.json()) as CheckInResponse;

      if (!response.ok || !body.data) {
        if (body.error?.retryable) {
          await addPendingScan(scan);
          await refreshPendingCount();
          setStatus("pending");
          setMessage("Connection is unavailable. This scan is queued for confirmation.");
          return;
        }
        setStatus("error");
        setMessage(body.error?.message ?? "We could not confirm this check-in. Please try again.");
        return;
      }

      await removePendingScan(scan.clientScanId);
      await refreshPendingCount();
      setResult(body.data);
      setStatus(body.data.outcome === "valid_first" ? "success" : "repeat");
      setMessage(
        body.data.outcome === "valid_first"
          ? `${body.data.guest_name} is checked in.`
          : `${body.data.guest_name} has already checked in today.`,
      );
    } catch {
      await addPendingScan(scan);
      await refreshPendingCount();
      setStatus("pending");
      setMessage("Connection is unavailable. This scan is queued for confirmation.");
    } finally {
      lockedRef.current = false;
    }
  }

  async function startCamera() {
    stopCamera();
    lockedRef.current = false;
    setResult(undefined);
    setStatus("requesting");
    setMessage("Allow camera access to scan a guest QR pass.");

    try {
      const reader = new BrowserQRCodeReader();
      const controls = await reader.decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
          },
        },
        videoRef.current ?? undefined,
        (scanResult) => {
          if (scanResult) void submitPass(scanResult.getText());
        },
      );
      controlsRef.current = controls;
      setStatus("scanning");
      setMessage("Scanning… keep the QR code steady inside the frame.");
    } catch {
      setStatus("error");
      setMessage(
        "We could not access the camera. Check browser permission, then try again or paste a pass link below.",
      );
    }
  }

  function submitManualPass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (manualPass.trim()) void submitPass(manualPass.trim());
  }

  async function retryPendingScans() {
    const scans = await getPendingScans();
    if (!scans.length) return;

    for (const scan of scans) {
      await submitPass(scan.payload, scan);
    }
  }

  useEffect(() => {
    retryPendingScansRef.current = retryPendingScans;
  });

  useEffect(() => {
    const initialQueueRead = window.setTimeout(() => {
      void refreshPendingCount();
    }, 0);
    const handleOnline = () => void retryPendingScansRef.current();
    window.addEventListener("online", handleOnline);
    return () => {
      window.clearTimeout(initialQueueRead);
      window.removeEventListener("online", handleOnline);
      stopCamera();
    };
  }, []);

  return (
    <section className="scanner-grid">
      <div className="scanner-frame">
        <video className="scanner-video" muted playsInline ref={videoRef} />
        {status !== "scanning" && status !== "submitting" && (
          <div className="scanner-placeholder">
            <Camera aria-hidden="true" size={40} strokeWidth={1.4} />
            <strong>{status === "requesting" ? "Waiting for camera access" : "Ready to scan"}</strong>
          </div>
        )}
        <div className="scan-target" aria-hidden="true" />
        <p className={`scan-feedback scan-feedback-${status}`} role="status">{message}</p>
        {result && (
          <div className="scan-result">
            <strong>{result.guest_name}</strong>
            <span>
              {status === "success" ? "First arrival confirmed" : `Repeat scan · ${result.scan_count} scans today`}
            </span>
          </div>
        )}
      </div>
      <aside className="scanner-instructions">
        <h2>Check in a guest</h2>
        <ol>
          <li>Open the camera and point it at the guest’s QR pass.</li>
          <li>Wait for the server-confirmed result before moving on.</li>
          <li>Repeat scans are recorded without increasing attendance.</li>
        </ol>
        {status === "scanning" ? (
          <button className="button button-secondary" onClick={stopCamera} type="button">
            <SquareStop aria-hidden="true" size={18} />
            Stop camera
          </button>
        ) : (
          <button className="button button-primary" onClick={() => void startCamera()} type="button">
            <Camera aria-hidden="true" size={18} />
            Start camera
          </button>
        )}
        {pendingCount > 0 && (
          <button className="button button-secondary" onClick={() => void retryPendingScans()} type="button">
            <RefreshCw aria-hidden="true" size={18} />
            Retry {pendingCount} pending {pendingCount === 1 ? "scan" : "scans"}
          </button>
        )}
        <form className="manual-pass-form" onSubmit={submitManualPass}>
          <label htmlFor="manual-pass">
            <Keyboard aria-hidden="true" size={16} />
            Paste a pass link
          </label>
          <input
            id="manual-pass"
            onChange={(event) => setManualPass(event.target.value)}
            placeholder="https://…/pass/…"
            type="url"
            value={manualPass}
          />
          <button disabled={!manualPass.trim() || status === "submitting"} type="submit">
            Check in pass
          </button>
        </form>
      </aside>
    </section>
  );
}
