import "server-only";

import { createHash } from "node:crypto";

import { z } from "zod";

import { normalizeEmail } from "@/lib/auth/staff";
import { EVENT_ID } from "@/lib/event";
import { ensureGuestPass } from "@/lib/pass-issuer";
import { readRegistrationSheet } from "@/lib/registration-sheet";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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

export async function syncRegistrationSheet(actorMembershipId: string | null) {
  const rows = await readRegistrationSheet();
  const admin = createSupabaseAdminClient();
  const { data: existing, error: existingError } = await admin.from("guests")
    .select("id, display_name, normalized_email, ticket_type, category, title, organization, region, country, external_reference")
    .eq("event_id", EVENT_ID);
  if (existingError) throw existingError;
  const byEmail = new Map((existing ?? []).map((guest) => [String(guest.normalized_email).toLowerCase(), guest]));
  const sourceReferenceCounts = new Map<string, number>();
  for (const { cells } of rows) {
    const reference = tidy(cells[1]);
    if (reference) sourceReferenceCounts.set(reference, (sourceReferenceCounts.get(reference) ?? 0) + 1);
  }
  const seenEmails = new Set<string>();
  const passQueue: Array<{ guestId: string; sheetRow: number }> = [];
  const summary = { sourceRows: rows.length, created: 0, pendingReview: 0, unchanged: 0, invalidRows: [] as number[], duplicateRows: [] as number[], passFailures: [] as number[] };
  await admin.from("imports").update({ status: "failed", summary: { error: "Previous sync interrupted" } })
    .eq("event_id", EVENT_ID).eq("source_filename", "GTP2026 Registration Namelist / Sheet1")
    .eq("status", "previewed").lt("created_at", new Date(Date.now() - 30 * 60_000).toISOString());
  const { data: run, error: runError } = await admin.from("imports").insert({
    event_id: EVENT_ID, uploaded_by: actorMembershipId, source_filename: "GTP2026 Registration Namelist / Sheet1",
    status: "previewed", summary: { sourceRows: rows.length },
  }).select("id").single();
  if (runError || !run) throw runError ?? new Error("Unable to record sheet sync.");

  try {
    for (const { cells, sheetRow } of rows) {
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
        if (error || !created) throw error ?? new Error(`Guest insertion failed for Sheet row ${sheetRow}.`);
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
      if (staleError) throw staleError;
      const { data: queued, error } = await admin.from("guest_source_changes")
        .upsert({ event_id: EVENT_ID, guest_id: current.id, proposed: source, source_hash: hash }, { onConflict: "guest_id,source_hash", ignoreDuplicates: true })
        .select("id");
      if (error) throw error;
      if (queued?.length) summary.pendingReview += 1;
      passQueue.push({ guestId: current.id, sheetRow });
    }
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
    if (completeError) throw completeError;
    const { error: auditError } = await admin.from("audit_events").insert({ event_id: EVENT_ID, actor_membership_id: actorMembershipId,
      action: "guests.sheet_synced", entity_type: "import", entity_id: run.id, metadata: summary });
    if (auditError) throw auditError;
    return summary;
  } catch (error) {
    await admin.from("imports").update({ status: "failed", summary: { ...summary, error: "Sync interrupted" } }).eq("id", run.id);
    throw error;
  }
}
