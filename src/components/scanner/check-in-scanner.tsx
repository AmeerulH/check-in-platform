"use client";

import { BrowserQRCodeReader } from "@zxing/browser";
import { Camera, Keyboard, LoaderCircle, RefreshCw, SquareStop } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";

import { ManualCheckIn } from "@/components/scanner/manual-check-in";
import { EVENT_TIMEZONE } from "@/lib/event";
import { deviceLabel } from "@/lib/scanner/device-label";
import {
  addPendingScan,
  getPendingScans,
  removePendingScan,
  updatePendingScan,
  type PendingScan,
} from "@/lib/scanner/pending-scans";

type ScannerStatus = "idle" | "requesting" | "scanning" | "submitting" | "success" | "repeat" | "pending" | "error";

type CheckInData = {
  guest_name: string;
  outcome: "valid_first" | "valid_repeat";
  scan_count: number;
  received_at: string;
};

type CheckInResponse = {
  data?: CheckInData;
  error?: {
    code?: string;
    message?: string;
    retryable?: boolean;
  };
};

type ScannerControls = { stop: () => void };

const SAME_PASS_COOLDOWN_MS = 4_000;

function formatCapturedAt(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-MY", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: EVENT_TIMEZONE,
  }).format(parsed);
}

async function postCheckIn(scan: PendingScan): Promise<
  | { ok: true; data: CheckInData }
  | { ok: false; retryable: boolean; message: string }
> {
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
      return {
        ok: false,
        retryable: Boolean(body.error?.retryable),
        message: body.error?.message ?? "We could not confirm this check-in. Please try again.",
      };
    }
    return { ok: true, data: body.data };
  } catch {
    return {
      ok: false,
      retryable: true,
      message: "Connection is unavailable. This scan is queued for confirmation.",
    };
  }
}

export function CheckInScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<ScannerControls | null>(null);
  const lockedRef = useRef(false);
  const activeScanIdRef = useRef<string | null>(null);
  const syncingRef = useRef(false);
  const cooldownRef = useRef<{ payload: string; until: number } | null>(null);
  const syncPendingScansRef = useRef<(options?: { quiet?: boolean }) => Promise<void>>(async () => {});
  const [manualPass, setManualPass] = useState("");
  const [result, setResult] = useState<CheckInData>();
  const [isRetrying, setIsRetrying] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [message, setMessage] = useState("Start the camera, then hold a GTP QR pass inside the frame.");
  const [queueNote, setQueueNote] = useState("");
  const [pendingScans, setPendingScans] = useState<PendingScan[]>([]);
  const [status, setStatus] = useState<ScannerStatus>("idle");
  const queuedScans = pendingScans.filter((scan) => !scan.failed);
  const failedScans = pendingScans.filter((scan) => scan.failed);

  function stopCamera() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    const stream = videoRef.current?.srcObject;
    if (stream instanceof MediaStream) {
      stream.getTracks().forEach((track) => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }

  async function refreshPendingScans() {
    setPendingScans(await getPendingScans());
  }

  async function submitPass(payload: string, pendingScan?: PendingScan) {
    const cooled = cooldownRef.current;
    if (lockedRef.current) return;
    if (!pendingScan && cooled && cooled.payload === payload && Date.now() < cooled.until) return;

    const scan = pendingScan ?? {
      payload,
      clientScanId: crypto.randomUUID(),
      deviceLabel: deviceLabel(),
      capturedAt: new Date().toISOString(),
    };
    lockedRef.current = true;
    activeScanIdRef.current = scan.clientScanId;
    setResult(undefined);
    setStatus("submitting");
    setMessage("Confirming this pass with the check-in service…");
    let settled = false;

    try {
      const outcome = await postCheckIn(scan);
      if (!outcome.ok) {
        if (outcome.retryable) {
          await addPendingScan({ ...scan, lastError: outcome.message });
          await refreshPendingScans();
          setStatus("pending");
          setMessage(outcome.message);
          settled = true;
          return;
        }
        if (pendingScan) {
          await updatePendingScan(scan.clientScanId, {
            attempts: (scan.attempts ?? 0) + 1,
            failed: true,
            lastError: outcome.message,
          });
          await refreshPendingScans();
        }
        setStatus("error");
        setMessage(outcome.message);
        settled = true;
        return;
      }

      await removePendingScan(scan.clientScanId);
      await refreshPendingScans();
      setResult(outcome.data);
      setStatus(outcome.data.outcome === "valid_first" ? "success" : "repeat");
      setMessage(
        outcome.data.outcome === "valid_first"
          ? `${outcome.data.guest_name} is checked in.`
          : `${outcome.data.guest_name} has already checked in today.`,
      );
      settled = true;
    } catch {
      await addPendingScan({
        ...scan,
        lastError: "Connection is unavailable. This scan is queued for confirmation.",
      });
      await refreshPendingScans();
      setStatus("pending");
      setMessage("Connection is unavailable. This scan is queued for confirmation.");
      settled = true;
    } finally {
      if (!pendingScan) {
        cooldownRef.current = { payload: scan.payload, until: Date.now() + SAME_PASS_COOLDOWN_MS };
      }
      activeScanIdRef.current = null;
      lockedRef.current = false;
      if (!settled) {
        setStatus("error");
        setMessage("We could not confirm this check-in. Please try again.");
      }
    }
  }

  async function syncPendingScans(options?: { quiet?: boolean }) {
    if (syncingRef.current) return;
    syncingRef.current = true;
    if (!options?.quiet) setIsRetrying(true);
    let confirmed = 0;

    try {
      const scans = await getPendingScans();
      for (const scan of scans) {
        if (scan.failed || scan.clientScanId === activeScanIdRef.current) continue;
        const outcome = await postCheckIn(scan);
        if (outcome.ok) {
          await removePendingScan(scan.clientScanId);
          confirmed += 1;
          continue;
        }
        await updatePendingScan(scan.clientScanId, {
          attempts: (scan.attempts ?? 0) + 1,
          failed: !outcome.retryable,
          lastError: outcome.message,
        });
      }
    } finally {
      syncingRef.current = false;
      if (!options?.quiet) setIsRetrying(false);
      await refreshPendingScans();
    }

    if (confirmed > 0) {
      setQueueNote(confirmed === 1 ? "1 queued scan was confirmed." : `${confirmed} queued scans were confirmed.`);
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
      setCameraActive(true);
      setStatus("scanning");
      setMessage("Scanning… keep the QR code steady inside the frame.");
    } catch {
      setCameraActive(false);
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

  async function dismissFailedScan(clientScanId: string) {
    await removePendingScan(clientScanId);
    await refreshPendingScans();
  }

  useEffect(() => {
    syncPendingScansRef.current = syncPendingScans;
  });

  useEffect(() => {
    const initialQueueRead = window.setTimeout(() => {
      void refreshPendingScans().then(() => syncPendingScansRef.current({ quiet: true }));
    }, 0);
    const handleOnline = () => void syncPendingScansRef.current({ quiet: true });
    window.addEventListener("online", handleOnline);
    return () => {
      window.clearTimeout(initialQueueRead);
      window.removeEventListener("online", handleOnline);
      stopCamera();
    };
  }, []);

  useEffect(() => {
    if (!queuedScans.length) return;
    const interval = window.setInterval(() => {
      void syncPendingScansRef.current({ quiet: true });
    }, 20_000);
    return () => window.clearInterval(interval);
  }, [queuedScans.length]);

  return (
    <section className="scanner-grid">
      <div className="scanner-frame">
        <video className="scanner-video" muted playsInline ref={videoRef} />
        {!cameraActive && status !== "submitting" && (
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
          <li>The camera stays on. Wait for the confirmed name, then scan the next guest.</li>
          <li>Repeat scans are recorded without increasing attendance.</li>
        </ol>
        {cameraActive ? (
          <button className="button button-secondary" onClick={stopCamera} type="button">
            <SquareStop aria-hidden="true" size={18} />
            Stop camera
          </button>
        ) : (
          <button
            className="button button-primary"
            disabled={status === "requesting" || status === "submitting"}
            onClick={() => void startCamera()}
            type="button"
          >
            {status === "requesting" ? <LoaderCircle aria-hidden="true" className="spin" size={18} /> : <Camera aria-hidden="true" size={18} />}
            {status === "requesting" ? "Opening camera…" : "Start camera"}
          </button>
        )}
        {queuedScans.length > 0 && (
          <button className="button button-secondary" disabled={isRetrying || status === "submitting"} onClick={() => void syncPendingScans()} type="button">
            {isRetrying ? <LoaderCircle aria-hidden="true" className="spin" size={18} /> : <RefreshCw aria-hidden="true" size={18} />}
            {isRetrying ? "Retrying scans…" : `Retry ${queuedScans.length} pending ${queuedScans.length === 1 ? "scan" : "scans"}`}
          </button>
        )}
        {queueNote && <p className="lookup-note" role="status">{queueNote}</p>}
        {failedScans.length > 0 && (
          <div>
            <h3>Needs review</h3>
            <ul className="pending-review">
              {failedScans.map((scan) => (
                <li key={scan.clientScanId}>
                  <strong>{formatCapturedAt(scan.capturedAt)}</strong>
                  <span>{scan.lastError ?? "This scan could not be confirmed."}</span>
                  <button onClick={() => void dismissFailedScan(scan.clientScanId)} type="button">Dismiss</button>
                </li>
              ))}
            </ul>
          </div>
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
            {status === "submitting" ? "Confirming pass…" : "Check in pass"}
          </button>
        </form>
        <ManualCheckIn />
      </aside>
    </section>
  );
}
