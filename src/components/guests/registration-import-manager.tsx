"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Change = { id: string; proposed: Record<string, string | null>; guest: Record<string, string | null> | null };
const reviewFields = [
  ["display_name", "Name"], ["normalized_email", "Email"], ["ticket_type", "Ticket"],
  ["category", "Category"], ["title", "Designation"], ["organization", "Organization"],
  ["region", "Region"], ["country", "Country"], ["external_reference", "Registration ID"],
] as const;

export function RegistrationImportManager({ latest, changes, guide }: {
  latest: { status: string; summary: unknown; created_at: string } | null;
  changes: Change[];
  guide: { file_name: string; uploaded_at: string } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function syncNow() {
    setBusy("sync"); setMessage("");
    try {
      const response = await fetch("/api/registration-sync", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Sync failed.");
      setMessage(`Sync finished: ${body.data.created} new, ${body.data.pendingReview} changes queued, ${body.data.passFailures.length} pass errors.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sync failed.");
      router.refresh();
    }
    finally { setBusy(null); }
  }

  async function review(changeId: string, decision: "apply" | "dismiss") {
    setBusy(changeId); setMessage("");
    try {
      const response = await fetch("/api/source-changes", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changeId, decision }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Review failed.");
      setMessage(`Change ${decision === "apply" ? "applied" : "dismissed"}.`);
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Review failed."); }
    finally { setBusy(null); }
  }

  async function uploadGuide(form: FormData) {
    setBusy("guide"); setMessage("");
    try {
      const response = await fetch("/api/guide", { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Upload failed.");
      setMessage("Participant guide uploaded."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Upload failed."); }
    finally { setBusy(null); }
  }

  const summary = latest?.summary && typeof latest.summary === "object" ? latest.summary as Record<string, unknown> : {};
  const tab = typeof summary.tab === "string" && summary.tab ? summary.tab : null;
  return <div className="admin-stack">
    <section className="content-panel admin-panel">
      <h2>Sheet connection</h2>
      <p>GTP2026 Registration Namelist{tab ? ` · ${tab}` : ""} · daily at 08:00 Malaysia time</p>
      <button disabled={busy !== null} onClick={() => void syncNow()} type="button">{busy === "sync" && <LoaderCircle aria-hidden="true" className="spin" size={16} />}{busy === "sync" ? "Syncing…" : "Sync now"}</button>
      <p>Last run: {latest ? `${latest.status} · ${new Date(latest.created_at).toLocaleString("en-MY")}` : "No run yet"}</p>
      {typeof summary.error === "string" && summary.error ? <p>Last error: {summary.error}</p> : null}
      {latest && <p>Rows: {String(summary.sourceRows ?? "—")} · New: {String(summary.created ?? "—")} · Changes queued: {String(summary.pendingReview ?? "—")}</p>}
      {Array.isArray(summary.invalidRows) && summary.invalidRows.length > 0 && <p>Rows needing review: {summary.invalidRows.join(", ")}</p>}
      {Array.isArray(summary.duplicateRows) && summary.duplicateRows.length > 0 && <p>Possible duplicates: {summary.duplicateRows.join(", ")}</p>}
      {Array.isArray(summary.passFailures) && summary.passFailures.length > 0 && <p>QR creation failed for rows: {summary.passFailures.join(", ")}</p>}
    </section>
    <section className="content-panel admin-panel">
      <h2>Participant guide</h2>
      <p>{guide ? `${guide.file_name} · uploaded ${new Date(guide.uploaded_at).toLocaleString("en-MY")}` : "No guide uploaded yet."}</p>
      <form onSubmit={(event) => { event.preventDefault(); void uploadGuide(new FormData(event.currentTarget)); }}>
        <input accept="application/pdf" name="guide" required type="file" />
        <button disabled={busy !== null} type="submit">{busy === "guide" && <LoaderCircle aria-hidden="true" className="spin" size={16} />}{busy === "guide" ? "Uploading…" : "Upload approved PDF"}</button>
      </form>
    </section>
    <section className="content-panel admin-panel">
      <h2>Review changes to existing guests ({changes.length})</h2>
      {!changes.length && <p>No changes awaiting review.</p>}
      {changes.map((change) => <article className="change-card" key={change.id}>
        <strong>{change.guest?.display_name ?? "Guest"}</strong> <span>{change.guest?.normalized_email}</span>
        <div className="change-fields">{reviewFields.filter(([key]) => change.guest?.[key] !== change.proposed[key]).map(([key, label]) =>
          <p key={key}><b>{label}:</b> {change.guest?.[key] || "—"} → {change.proposed[key] || "—"}</p>,
        )}</div>
        <div className="inline-actions">
          <button disabled={busy !== null} onClick={() => void review(change.id, "apply")} type="button">Apply</button>
          <button disabled={busy !== null} onClick={() => void review(change.id, "dismiss")} type="button">Dismiss</button>
          {busy === change.id && <span className="inline-loading-control" role="status"><LoaderCircle aria-hidden="true" className="spin" size={16} />Reviewing…</span>}
        </div>
      </article>)}
    </section>
    {message && <p className="status-message" role="status">{message}</p>}
  </div>;
}
