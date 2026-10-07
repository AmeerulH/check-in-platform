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
    .select("id, display_name, normalized_email, ticket_type, category, title, organization, region, country, external_reference")
    .eq("event_id", EVENT_ID);
  if (existingError) throw new SheetSyncError("database write", errorDetail(existingError), { cause: existingError });
  const byEmail = new Map((existing ?? []).map((guest) => [String(guest.normalized_email).toLowerCase(), guest]));
  const sourceReferenceCounts = new Map<string, number>();
  for (const { cells } of rows) {
    const reference = tidy(cells[1]);
    if (reference) sourceReferenceCounts.set(reference, (sourceReferenceCounts.get(reference) ?? 0) + 1);
  }
  const seenEmails = new Set<string>();
  const passQueue: Array<{ guestId: string; sheetRow: number }> = [];
  const summary = { tab, sourceRows: rows.length, created: 0, pendingReview: 0, unchanged: 0, invalidRows: [] as number[], duplicateRows: [] as number[], passFailures: [] as number[] };
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
      if (seenEmails.has(source.normalized_email)) { summary.duplicateRows.push(sheetRow); continue; }
      seenEmails.add(source.normalized_email);
      const referenceMatch = source.external_reference && sourceReferenceCounts.get(source.external_reference) === 1
        ? (existing ?? []).find((guest) => guest.external_reference === source.external_reference)
        : null;
      const current = byEmail.get(source.normalized_email) ?? referenceMatch;
      if (!current) {
        // A changed email can look like a new registration. Hold likely matches for review.
        const possibleMatch = (existing ?? []).find((guest) =>
          (tidy(guest.display_name).toLowerCase() === source.display_name.toLowerCase() &&
            tidy(guest.organization ?? "").toLowerCase() === tidy(source.organization ?? "").toLowerCase()),
        );
        if (possibleMatch) { summary.duplicateRows.push(sheetRow); continue; }
        const { data: created, error } = await admin.from("guests").insert({ event_id: EVENT_ID, ...source })
          .select("id").single();
        if (error || !created) throw new SheetSyncError("database write", errorDetail(error ?? new Error("Guest insertion failed.")), { cause: error, sheetRow });
        summary.created += 1;
        passQueue.push({ guestId: created.id, sheetRow });
        byEmail.set(source.normalized_email, { ...source, id: created.id });
        continue;
      }
      const changed = Object.entries(source).some(([key, value]) =>
        (current as Record<string, unknown>)[key] !== value,
      );
      if (!changed) {
        summary.unchanged += 1;
        passQueue.push({ guestId: current.id, sheetRow });
        continue;
      }
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
