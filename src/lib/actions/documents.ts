"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";
import {
  DOC_TYPE_SLUGS,
  OBLIGATION_KIND_SLUGS,
  FREQUENCY_SLUGS,
} from "@/lib/document-types";

const ALLOWED_MIMES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export type ObligationInput = {
  kind?: string | null;
  amount?: number | null;
  frequency?: string | null;
  next_due_date?: string | null;
  interest_rate?: number | null;
  balloon_amount?: number | null;
  balloon_date?: string | null;
  notes?: string | null;
};

export type SaveResult = { ok: boolean; error?: string; id?: string };

const isoDate = (v: unknown): string | null =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return isNaN(n) ? null : n;
};

function cleanObligation(raw: ObligationInput) {
  return {
    kind: OBLIGATION_KIND_SLUGS.includes(String(raw.kind)) ? String(raw.kind) : "other",
    amount: num(raw.amount),
    frequency: FREQUENCY_SLUGS.includes(String(raw.frequency)) ? String(raw.frequency) : null,
    next_due_date: isoDate(raw.next_due_date),
    interest_rate: num(raw.interest_rate),
    balloon_amount: num(raw.balloon_amount),
    balloon_date: isoDate(raw.balloon_date),
    notes: typeof raw.notes === "string" ? raw.notes.trim().slice(0, 500) || null : null,
  };
}

function parseObligations(raw: string) {
  try {
    const arr = JSON.parse(raw) as ObligationInput[];
    if (!Array.isArray(arr)) return [];
    return arr
      .map(cleanObligation)
      .filter(
        (o) =>
          o.amount !== null ||
          o.next_due_date !== null ||
          o.balloon_amount !== null ||
          o.interest_rate !== null ||
          o.notes !== null
      )
      .slice(0, 20);
  } catch {
    return [];
  }
}

function docFields(formData: FormData) {
  const type = String(formData.get("doc_type") ?? "other");
  return {
    title: String(formData.get("title") ?? "").trim().slice(0, 200),
    doc_type: DOC_TYPE_SLUGS.includes(type) ? type : "other",
    provider: String(formData.get("provider") ?? "").trim().slice(0, 200) || null,
    reference_no: String(formData.get("reference_no") ?? "").trim().slice(0, 200) || null,
    notes: String(formData.get("notes") ?? "").trim().slice(0, 2000) || null,
    start_date: isoDate(String(formData.get("start_date") ?? "")),
    expiry_date: isoDate(String(formData.get("expiry_date") ?? "")),
  };
}

/** A storage path the client hands us must live inside its own household folder. */
function safeStoragePath(raw: unknown, householdId: string): string | null {
  const path = typeof raw === "string" ? raw.trim() : "";
  if (!path) return null;
  if (!path.startsWith(`${householdId}/`) || path.includes("..")) return null;
  return path.slice(0, 400);
}

/**
 * Upload a document file (PDF or image) to the private 'documents' bucket.
 * Returns the storage path to pass to createDocument / updateDocument.
 * NB: Next server actions cap the request body (next.config bodySizeLimit),
 * so very large files may be rejected before reaching us — the form also
 * supports direct-to-storage upload for the full 10 MB.
 */
export async function uploadDocumentFile(
  formData: FormData
): Promise<{ ok: boolean; error?: string; path?: string; mime?: string }> {
  const { membership } = await requireModule("documents", "edit");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, error: "No file to upload." };
  if (!ALLOWED_MIMES.includes(file.type))
    return { ok: false, error: "That file type isn't supported — use a PDF, JPG, PNG or WEBP." };
  if (file.size > MAX_FILE_BYTES)
    return { ok: false, error: "That file is over 10 MB — try a smaller scan." };

  const ext =
    file.type === "application/pdf"
      ? "pdf"
      : file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
          ? "webp"
          : "jpg";
  const path = `${membership.household_id}/${crypto.randomUUID()}.${ext}`;
  const supabase = await createClient();
  const { error } = await supabase.storage
    .from("documents")
    .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type });
  if (error) return { ok: false, error: error.message };
  return { ok: true, path, mime: file.type };
}

export async function createDocument(formData: FormData): Promise<SaveResult> {
  const { membership, userId } = await requireModule("documents", "edit");
  const fields = docFields(formData);
  if (!fields.title) return { ok: false, error: "Give it a name first." };

  const storage_path = safeStoragePath(formData.get("storage_path"), membership.household_id);
  const mime = storage_path
    ? String(formData.get("mime") ?? "").trim().slice(0, 100) || null
    : null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .insert({
      ...fields,
      storage_path,
      mime,
      household_id: membership.household_id,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not save" };

  const obligations = parseObligations(String(formData.get("obligations") ?? "[]"));
  if (obligations.length > 0) {
    const { error: obErr } = await supabase.from("document_obligations").insert(
      obligations.map((o) => ({
        ...o,
        document_id: data.id,
        household_id: membership.household_id,
      }))
    );
    if (obErr) return { ok: true, id: data.id, error: `Saved, but the payments didn't: ${obErr.message}` };
  }

  revalidatePath("/documents");
  return { ok: true, id: data.id };
}

export async function updateDocument(formData: FormData): Promise<SaveResult> {
  const { membership } = await requireModule("documents", "edit");
  const id = String(formData.get("document_id") ?? "");
  const fields = docFields(formData);
  if (!fields.title) return { ok: false, error: "Give it a name first." };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("documents")
    .select("id, storage_path")
    .eq("id", id)
    .eq("household_id", membership.household_id)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Document not found" };

  // keep the current file unless the form supplies a replacement
  let storage_path = existing.storage_path as string | null;
  let mimeUpdate: Record<string, string | null> = {};
  const newPath = safeStoragePath(formData.get("storage_path"), membership.household_id);
  if (newPath && newPath !== existing.storage_path) {
    storage_path = newPath;
    mimeUpdate = { mime: String(formData.get("mime") ?? "").trim().slice(0, 100) || null };
    if (existing.storage_path) {
      await supabase.storage.from("documents").remove([existing.storage_path]);
    }
  }

  const { error } = await supabase
    .from("documents")
    .update({ ...fields, storage_path, ...mimeUpdate })
    .eq("id", id)
    .eq("household_id", membership.household_id);
  if (error) return { ok: false, error: error.message };

  const obligations = parseObligations(String(formData.get("obligations") ?? "[]"));
  await supabase.from("document_obligations").delete().eq("document_id", id);
  if (obligations.length > 0) {
    const { error: obErr } = await supabase.from("document_obligations").insert(
      obligations.map((o) => ({
        ...o,
        document_id: id,
        household_id: membership.household_id,
      }))
    );
    if (obErr) return { ok: true, id, error: `Saved, but the payments didn't: ${obErr.message}` };
  }

  revalidatePath("/documents");
  revalidatePath(`/documents/${id}`);
  return { ok: true, id };
}

/** Form action for the detail page's Delete button. */
export async function deleteDocument(formData: FormData) {
  const { membership } = await requireModule("documents", "edit");
  const id = String(formData.get("document_id") ?? "");

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("id, storage_path")
    .eq("id", id)
    .eq("household_id", membership.household_id)
    .maybeSingle();
  if (doc) {
    if (doc.storage_path) {
      await supabase.storage.from("documents").remove([doc.storage_path]);
    }
    await supabase.from("documents").delete().eq("id", doc.id);
  }
  revalidatePath("/documents");
  redirect("/documents");
}

/** Short-lived signed URL so the stored file can be opened in a new tab. */
export async function getDocumentSignedUrl(
  documentId: string
): Promise<{ ok: boolean; error?: string; url?: string }> {
  const { membership } = await requireModule("documents", "view");
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("id", documentId)
    .eq("household_id", membership.household_id)
    .maybeSingle();
  if (!doc?.storage_path) return { ok: false, error: "No file attached to this document." };
  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(doc.storage_path, 3600);
  if (error || !data?.signedUrl) return { ok: false, error: error?.message ?? "Could not open file" };
  return { ok: true, url: data.signedUrl };
}

export type ExtractedObligation = {
  kind: string | null;
  amount: number | null;
  frequency: string | null;
  next_due_date: string | null;
  interest_rate: number | null;
  balloon_amount: number | null;
  balloon_date: string | null;
};

export type ExtractedDocument = {
  title: string | null;
  doc_type: string | null;
  provider: string | null;
  reference_no: string | null;
  start_date: string | null;
  expiry_date: string | null;
  obligations: ExtractedObligation[];
};

export type ExtractResult = { ok: boolean; error?: string; data?: ExtractedDocument };

/**
 * Ask Claude to read a scanned/uploaded document (image or PDF) and pull out
 * the key facts. The result only PRE-FILLS the form client-side — the user
 * always confirms before anything is saved. Env-gated on ANTHROPIC_API_KEY.
 */
export async function extractDocument(
  fileBase64: string,
  mediaType: string
): Promise<ExtractResult> {
  await requireModule("documents", "edit");

  if (!ALLOWED_MIMES.includes(mediaType)) {
    return { ok: false, error: "That file type isn't readable — use a PDF, JPG, PNG or WEBP." };
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return {
      ok: false,
      error: "AI reading needs ANTHROPIC_API_KEY — fill the details in manually.",
    };
  }

  const fileBlock =
    mediaType === "application/pdf"
      ? {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: fileBase64 },
        }
      : {
          type: "image",
          source: { type: "base64", media_type: mediaType, data: fileBase64 },
        };

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 2500,
        messages: [
          {
            role: "user",
            content: [
              fileBlock,
              {
                type: "text",
                text: 'Read this household document (it could be a mortgage or loan contract, an insurance policy or renewal notice, a warranty or purchase receipt, a lease, a utility contract or a subscription). Reply with ONLY a JSON object, no other text: {"title": a short human-friendly name like "Home loan — CommBank" or "Car insurance — Toyota Corolla" or null, "doc_type": one of "mortgage"|"loan"|"insurance"|"warranty"|"lease"|"utility"|"subscription"|"other" or null, "provider": the company/bank/insurer name or null, "reference_no": the account/policy/contract number or null, "start_date": "YYYY-MM-DD" or null, "expiry_date": "YYYY-MM-DD" or null (the end, renewal or expiry date), "obligations": [{"kind": one of "repayment"|"premium"|"fee"|"payout"|"other", "amount": number or null, "frequency": one of "weekly"|"fortnightly"|"monthly"|"quarterly"|"yearly"|"one_off" or null, "next_due_date": "YYYY-MM-DD" or null, "interest_rate": annual percentage as a number (e.g. 5.99) or null, "balloon_amount": number or null, "balloon_date": "YYYY-MM-DD" or null}]}. Obligations are the money movements the document commits to: loan repayments, insurance premiums, regular fees, an insured payout amount, a final balloon payment. Amounts are plain numbers without currency symbols. Use null whenever you are not sure — never guess. Use [] for obligations if there are none.',
              },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      return { ok: false, error: `AI reading failed (${res.status}) — fill in manually.` };
    }
    const payload = await res.json();
    let text: string = payload?.content?.[0]?.text ?? "";
    text = text.replace(/```(?:json)?/g, "").trim();
    const match = text.match(/\{[\s\S]*\}/);
    let parsed: Record<string, unknown> = {};
    try {
      parsed = match ? JSON.parse(match[0]) : {};
    } catch {
      return { ok: false, error: "The AI answer was garbled — try again or fill in manually." };
    }

    const str = (v: unknown, max = 200): string | null =>
      typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

    const rawObs = Array.isArray(parsed.obligations) ? (parsed.obligations as unknown[]) : [];
    const obligations: ExtractedObligation[] = rawObs
      .filter((o): o is Record<string, unknown> => !!o && typeof o === "object")
      .map((o) => ({
        kind: OBLIGATION_KIND_SLUGS.includes(String(o.kind)) ? String(o.kind) : "other",
        amount: num(o.amount),
        frequency: FREQUENCY_SLUGS.includes(String(o.frequency)) ? String(o.frequency) : null,
        next_due_date: isoDate(o.next_due_date),
        interest_rate: num(o.interest_rate),
        balloon_amount: num(o.balloon_amount),
        balloon_date: isoDate(o.balloon_date),
      }))
      .filter(
        (o) =>
          o.amount !== null ||
          o.next_due_date !== null ||
          o.interest_rate !== null ||
          o.balloon_amount !== null
      )
      .slice(0, 20);

    return {
      ok: true,
      data: {
        title: str(parsed.title),
        doc_type: DOC_TYPE_SLUGS.includes(String(parsed.doc_type))
          ? String(parsed.doc_type)
          : null,
        provider: str(parsed.provider),
        reference_no: str(parsed.reference_no),
        start_date: isoDate(parsed.start_date),
        expiry_date: isoDate(parsed.expiry_date),
        obligations,
      },
    };
  } catch {
    return { ok: false, error: "AI reading failed — fill in manually." };
  }
}
