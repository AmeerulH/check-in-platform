import { apiError, apiSuccess } from "@/lib/api/response";
import { requireApiStaff } from "@/lib/auth/api";
import { EVENT_ID } from "@/lib/event";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const access = await requireApiStaff(["organizer"]);
  if (access.error) return access.error;
  const admin = createSupabaseAdminClient();
  const { data: document } = await admin.from("event_documents")
    .select("storage_path").eq("event_id", EVENT_ID).eq("document_key", "participant_guide").maybeSingle();
  if (!document) return apiError({ code: "GUIDE_UNAVAILABLE", message: "Upload the participant guide before sharing.", status: 404 });
  const { data, error } = await admin.storage.from("event-documents").download(document.storage_path);
  if (error || !data) return apiError({ code: "GUIDE_UNAVAILABLE", message: "The participant guide could not be retrieved.", status: 503 });
  return new Response(data, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": "attachment; filename=GTP-2026-participant-guide.pdf", "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  const access = await requireApiStaff(["organizer"]);
  if (access.error) return access.error;
  const form = await request.formData().catch(() => null);
  const file = form?.get("guide");
  if (!(file instanceof File) || file.size < 5 || file.size > 10 * 1024 * 1024 || file.type !== "application/pdf") {
    return apiError({ code: "GUEST_INVALID_INPUT", message: "Choose a PDF under 10 MB.", status: 400 });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.subarray(0, 5).toString() !== "%PDF-") {
    return apiError({ code: "GUEST_INVALID_INPUT", message: "The selected file is not a valid PDF.", status: 400 });
  }
  const admin = createSupabaseAdminClient();
  const path = `${EVENT_ID}/participant-guide-${crypto.randomUUID()}.pdf`;
  const { error: uploadError } = await admin.storage.from("event-documents")
    .upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (uploadError) return apiError({ code: "GUIDE_UNAVAILABLE", message: "The guide could not be stored.", status: 503 });
  const { data: old } = await admin.from("event_documents").select("storage_path")
    .eq("event_id", EVENT_ID).eq("document_key", "participant_guide").maybeSingle();
  const { error } = await admin.from("event_documents").upsert({
    event_id: EVENT_ID, document_key: "participant_guide", storage_path: path,
    file_name: file.name, uploaded_at: new Date().toISOString(), uploaded_by: access.staffMember.id,
  });
  if (error) {
    await admin.storage.from("event-documents").remove([path]);
    return apiError({ code: "GUIDE_UNAVAILABLE", message: "The guide could not be saved.", status: 503 });
  }
  if (old?.storage_path) await admin.storage.from("event-documents").remove([old.storage_path]);
  await admin.from("audit_events").insert({ event_id: EVENT_ID, actor_membership_id: access.staffMember.id,
    action: "participant_guide.uploaded", entity_type: "event", entity_id: EVENT_ID });
  return apiSuccess({ data: { fileName: file.name } });
}
