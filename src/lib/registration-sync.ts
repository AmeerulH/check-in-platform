import "server-only";

import { createHash } from "node:crypto";

import { z } from "zod";

import { normalizeEmail } from "@/lib/auth/staff";
import { EVENT_ID } from "@/lib/event";
import { ensureGuestPass } from "@/lib/pass-issuer";
import { readRegistrationSheet } from "@/lib/registration-sheet";
import { asSheetSyncError, errorDetail, SheetSyncError } from "@/lib/sheet-sync-error";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const SOURCE_FILENAME = "GTP2026 Registration Namelist / Sheet1";
const emailSchema = z.email();
const tidy = (value?: string) => value?.replace(/\s+/g, " ").trim() ?? "";
const nullable = (value?: string) => tidy(value) || null;

export type SourceGuest = {
  display_name: string;
  normalized_email: string;
  ticket_type: string;
  category: string;
  title: string | null;
  organization: string | null;
  region: string | null;
  country: string | null;
  external_reference: string | null;
};

function parseRow(cells: string[]): SourceGuest | null {
  const email = normalizeEmail(tidy(cells[2]));
  const displayName = tidy(cells[0]);
  const ticket = tidy(cells[4]);
  if (!displayName || !ticket || !emailSchema.safeParse(email).success) return null;
  return {
    display_name: displayName, normalized_email: email, ticket_type: ticket,
    category: ticket.toLowerCase() === "speaker" ? "Speaker" : "Delegate",
    title: nullable(cells[8]), organization: nullable(cells[9]),
    region: nullable(cells[10]), country: nullable(cells[11]),
    external_reference: nullable(cells[1]),
  };
}

function isUniqueViolation(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && String(error.code) === "23505");
}

async function recordFailedSheetRead(actorMembershipId: string | null, syncError: SheetSyncError) {
  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("imports").insert({
      event_id: EVENT_ID,
      uploaded_by: actorMembershipId,
      source_filename: SOURCE_FILENAME,
      status: "failed",
      summary: { error: syncError.message },
    }).select("id").single();
    if (error) throw error;
  } catch (error) {
    console.error("Could not record the failed sheet sync.", error);
    throw new SheetSyncError("database write", errorDetail(error), { cause: error });
  }
}

async function commitRegistrationSheet(actorMembershipId: string | null, sheet: Awaited<ReturnType<typeof readRegistrationSheet>>) {
  const admin = createSupabaseAdminClient();
  const { rows, tab } = sheet;
  const { data: existing, error: existingError } = await admin.from("guests")
    .select("id, display_name, normalized_email, ticket_type, category, title, organization, region, country, external_reference, email_marked_sent_at")
    .eq("event_id", EVENT_ID);
  if (existingError) throw new SheetSyncError("database write", errorDetail(existingError), { cause: existingError });
  const roster = [...(existing ?? [])];
  const claimed = new Set<string>(); // guests already matched to a Sheet row during this sync
  const lower = (value: unknown) => tidy(String(value ?? "")).toLowerCase();
  // How many Sheet rows list each email; shared emails are allowed, so identity is email + name.
  const sheetEmailCounts = new Map<string, number>();
  for (const { cells } of rows) {
    const email = normalizeEmail(tidy(cells[2]));
    sheetEmailCounts.set(email, (sheetEmailCounts.get(email) ?? 0) + 1);
  }
  const { data: pendingRows, error: pendingError } = await admin.from("guest_source_changes")
    .select("guest_id").eq("event_id", EVENT_ID).eq("status", "pending");
  if (pendingError) throw new SheetSyncError("database write", errorDetail(pendingError), { cause: pendingError });
  const guestsWithPending = new Set((pendingRows ?? []).map((row) => row.guest_id as string));
  const sourceReferenceCounts = new Map<string, number>();
  for (const { cells } of rows) {
    const reference = tidy(cells[1]);
    if (reference) sourceReferenceCounts.set(reference, (sourceReferenceCounts.get(reference) ?? 0) + 1);
  }
  const passQueue: Array<{ guestId: string; sheetRow: number }> = [];
  const summary = { tab, sourceRows: rows.length, created: 0, updated: 0, updatedRows: [] as number[], pendingReview: 0, unchanged: 0, invalidRows: [] as number[], duplicateRows: [] as number[], passFailures: [] as number[] };
  await admin.from("imports").update({ status: "failed", summary: { error: "Previous sync interrupted" } })
    .eq("event_id", EVENT_ID).eq("source_filename", SOURCE_FILENAME)
    .eq("status", "previewed").lt("created_at", new Date(Date.now() - 30 * 60_000).toISOString());
  const { data: run, error: runError } = await admin.from("imports").insert({
    event_id: EVENT_ID, uploaded_by: actorMembershipId, source_filename: SOURCE_FILENAME,
    status: "previewed", summary: { sourceRows: rows.length, tab },
  }).select("id").single();
  if (runError || !run) {
    if (isUniqueViolation(runError)) throw new SheetSyncError("sync already running", errorDetail(runError), { cause: runError });
    throw new SheetSyncError("database write", errorDetail(runError ?? new Error("Unable to record sheet sync.")), { cause: runError });
  }

  let activeSheetRow: number | undefined;
  try {
    for (const { cells, sheetRow } of rows) {
      activeSheetRow = sheetRow;
      const source = parseRow(cells);
      if (!source) { summary.invalidRows.push(sheetRow); continue; }
      // Every Sheet row is a guest, even when two rows share an email or a name. Match in order of confidence.
      const free = roster.filter((guest) => !claimed.has(guest.id));
      const referenceMatch = source.external_reference && sourceReferenceCounts.get(source.external_reference) === 1
        ? free.find((guest) => guest.external_reference === source.external_reference)
        : undefined;
      let current = referenceMatch
        ?? free.find((guest) => lower(guest.normalized_email) === source.normalized_email && lower(guest.display_name) === lower(source.display_name));
      if (!current && sheetEmailCounts.get(source.normalized_email) === 1) {
        // Only one row uses this email, so a different name on it is a rename or correction of the same guest.
        const sameEmail = free.filter((guest) => lower(guest.normalized_email) === source.normalized_email);
        if (sameEmail.length === 1) current = sameEmail[0];
        else if (sameEmail.length > 1) { summary.duplicateRows.push(sheetRow); continue; }
      }
      if (!current) {
        // A changed email looks like a new registration. Re-point a guest only when exactly one guest has the
        // same name and organization and the Sheet no longer lists that guest's old email.
        const sameIdentity = free.filter((guest) => lower(guest.display_name) === lower(source.display_name) &&
          lower(guest.organization) === lower(source.organization));
        if (sameIdentity.length === 1 && !sheetEmailCounts.has(lower(sameIdentity[0].normalized_email))) current = sameIdentity[0];
      }
      if (current) claimed.add(current.id);
      if (!current) {
        const { data: created, error } = await admin.from("guests").insert({ event_id: EVENT_ID, ...source })
          .select("id").single();
        // The database may still enforce one guest per email. Report the row instead of aborting the sync.
        if (isUniqueViolation(error)) { summary.duplicateRows.push(sheetRow); continue; }
        if (error || !created) throw new SheetSyncError("database write", errorDetail(error ?? new Error("Guest insertion failed.")), { cause: error, sheetRow });
        summary.created += 1;
        passQueue.push({ guestId: created.id, sheetRow });
        claimed.add(created.id);
        roster.push({ ...source, id: created.id, email_marked_sent_at: null });
        continue;
      }
      const changed = Object.entries(source).some(([key, value]) =>
        (current as Record<string, unknown>)[key] !== value,
      );
      if (!changed) {
        // The Sheet already matches, so any change still waiting for review is stale.
        if (guestsWithPending.has(current.id)) {
          const { error: staleError } = await admin.from("guest_source_changes")
            .update({ status: "dismissed", reviewed_at: new Date().toISOString() })
            .eq("guest_id", current.id).eq("status", "pending");
          if (staleError) throw staleError;
        }
        summary.unchanged += 1;
        passQueue.push({ guestId: current.id, sheetRow });
        continue;
      }
      if (!current.email_marked_sent_at) {
        // The Sheet is the source of truth. Nothing has gone out to this guest yet, so follow it directly.
        const { error: updateError } = await admin.from("guests").update(source)
          .eq("id", current.id).eq("event_id", EVENT_ID);
        if (isUniqueViolation(updateError)) { summary.duplicateRows.push(sheetRow); continue; }
        if (updateError) throw updateError;
        const { error: clearError } = await admin.from("guest_source_changes")
          .update({ status: "dismissed", reviewed_at: new Date().toISOString() })
          .eq("guest_id", current.id).eq("status", "pending");
        if (clearError) throw clearError;
        Object.assign(current, source); // keep the in-memory roster in step for later rows
        summary.updated += 1;
        summary.updatedRows.push(sheetRow);
        passQueue.push({ guestId: current.id, sheetRow });
        continue;
      }
      // An invite was already marked sent, so changing the guest could orphan what they received. Hold for review.
      const hash = createHash("sha256").update(JSON.stringify(source)).digest("hex");
      const { error: staleError } = await admin.from("guest_source_changes").update({ status: "dismissed" })
        .eq("guest_id", current.id).eq("status", "pending").neq("source_hash", hash);
      if (staleError) throw new SheetSyncError("database write", errorDetail(staleError), { cause: staleError, sheetRow });
      const { data: queued, error } = await admin.from("guest_source_changes")
        .upsert({ event_id: EVENT_ID, guest_id: current.id, proposed: source, source_hash: hash }, { onConflict: "guest_id,source_hash", ignoreDuplicates: true })
        .select("id");
      if (error) throw new SheetSyncError("database write", errorDetail(error), { cause: error, sheetRow });
      if (queued?.length) summary.pendingReview += 1;
      passQueue.push({ guestId: current.id, sheetRow });
    }
    activeSheetRow = undefined;
    for (let index = 0; index < passQueue.length; index += 5) {
      const group = passQueue.slice(index, index + 5);
      const results = await Promise.allSettled(group.map(({ guestId }) => ensureGuestPass(guestId)));
      results.forEach((result, offset) => {
        if (result.status === "rejected" || result.value === "needs_repair") {
          summary.passFailures.push(group[offset].sheetRow);
        }
      });
    }
    const { error: completeError } = await admin.from("imports").update({ status: "committed", summary, committed_at: new Date().toISOString() }).eq("id", run.id);
    if (completeError) throw new SheetSyncError("database write", errorDetail(completeError), { cause: completeError });
    const { error: auditError } = await admin.from("audit_events").insert({ event_id: EVENT_ID, actor_membership_id: actorMembershipId,
      action: "guests.sheet_synced", entity_type: "import", entity_id: run.id, metadata: summary });
    if (auditError) throw new SheetSyncError("database write", errorDetail(auditError), { cause: auditError });
    return summary;
  } catch (error) {
    const syncError = error instanceof SheetSyncError
      ? error
      : new SheetSyncError("database write", errorDetail(error), { cause: error, sheetRow: activeSheetRow });
    const { error: updateError } = await admin.from("imports").update({ status: "failed", summary: { ...summary, error: syncError.message } }).eq("id", run.id);
    if (updateError) console.error("Could not record the failed sheet sync.", updateError);
    else syncError.recorded = true;
    throw syncError;
  }
}

export async function syncRegistrationSheet(actorMembershipId: string | null) {
  try {
    return await commitRegistrationSheet(actorMembershipId, await readRegistrationSheet());
  } catch (error) {
    const syncError = asSheetSyncError(error);
    console.error("Registration sync failed.", error);
    if (!syncError.recorded) await recordFailedSheetRead(actorMembershipId, syncError);
    throw syncError;
  }
}
