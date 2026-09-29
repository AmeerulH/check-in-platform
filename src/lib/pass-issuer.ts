import "server-only";

import { createCredentialToken, createPassQrDataUrl, createPassQrPng, createPassUrl, digestCredentialToken } from "@/lib/credentials";
import { EVENT_ID } from "@/lib/event";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type IssuedCredential = { credential_id: string; public_id: string; version: number };

export async function issueGuestPass(guestId: string, actorMembershipId: string | null) {
  const admin = createSupabaseAdminClient();
  const { data: guest, error: guestError } = await admin.from("guests")
    .select("id, display_name, status").eq("id", guestId).eq("event_id", EVENT_ID).maybeSingle();
  if (guestError || !guest || guest.status !== "active") throw new Error("GUEST_NOT_FOUND");

  const { data: prior } = await admin.from("guest_credentials")
    .select("id, storage_path").eq("guest_id", guest.id).is("revoked_at", null).maybeSingle();
  const token = createCredentialToken();
  const { data: issued, error: issueError } = await admin.rpc("issue_guest_credential", {
    target_guest_id: guest.id,
    next_token_digest: digestCredentialToken(token),
  }).single();
  const credential = issued as IssuedCredential | null;
  if (issueError || !credential) throw new Error("CREDENTIAL_ISSUE_FAILED");

  const passUrl = createPassUrl(credential.public_id, token);
  const storagePath = `${EVENT_ID}/${guest.id}/${credential.credential_id}.png`;
  const linkPath = `${storagePath}.txt`;
  try {
    const png = await createPassQrPng(passUrl);
    const { error: pngError } = await admin.storage.from("guest-passes").upload(storagePath, png, {
      contentType: "image/png", upsert: false,
    });
    if (pngError) throw pngError;
    const { error: linkError } = await admin.storage.from("guest-passes").upload(
      linkPath, Buffer.from(passUrl, "utf8"), { contentType: "text/plain", upsert: false },
    );
    if (linkError) throw linkError;
    const { error: pathError } = await admin.from("guest_credentials")
      .update({ storage_path: storagePath }).eq("id", credential.credential_id);
    if (pathError) throw pathError;
  } catch (error) {
    await admin.storage.from("guest-passes").remove([storagePath, linkPath]);
    await admin.from("guest_credentials").update({ revoked_at: new Date().toISOString() })
      .eq("id", credential.credential_id);
    if (prior?.id && prior.storage_path) {
      await admin.from("guest_credentials").update({ revoked_at: null }).eq("id", prior.id);
    }
    console.error("Unable to store guest pass.", error);
    throw new Error("CREDENTIAL_FILE_STORE_FAILED");
  }

  if (prior?.storage_path) {
    const { error } = await admin.storage.from("guest-passes").remove([
      prior.storage_path, `${prior.storage_path}.txt`,
    ]);
    if (error) console.error("Unable to remove old pass file.", error);
  }
  await admin.from("audit_events").insert({
    event_id: EVENT_ID, actor_membership_id: actorMembershipId,
    action: "guest_credential.issued", entity_type: "guest_credential",
    entity_id: credential.credential_id, metadata: { guestId: guest.id, version: credential.version },
  });
  return {
    guestName: guest.display_name, passUrl, publicId: credential.public_id,
    qrDataUrl: await createPassQrDataUrl(passUrl), version: credential.version,
  };
}

export async function ensureGuestPass(guestId: string) {
  const admin = createSupabaseAdminClient();
  const { data: active, error } = await admin.from("guest_credentials")
    .select("id, storage_path").eq("guest_id", guestId).is("revoked_at", null).maybeSingle();
  if (error) throw error;
  if (active?.storage_path) return "ready" as const;
  if (active) return "needs_repair" as const;
  await issueGuestPass(guestId, null);
  return "created" as const;
}
