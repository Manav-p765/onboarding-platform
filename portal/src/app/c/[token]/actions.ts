"use server";

import {
  getClientByToken,
  getFile,
  listCredentials,
  removeCredential,
  removeFile,
  saveAnswer,
  submitClient,
  upsertCredential,
  type Client,
} from "@/lib/clients";
import { DEFAULT_PLATFORMS, formsForClient, type Field } from "@/lib/forms";
import { getBranding } from "@/lib/settings";
import { APP_URL, sendMail } from "@/lib/mail";
import { buildBriefPdf } from "@/lib/pdf";
import { UPLOAD_DIR } from "@/lib/db";
import { createChangeRequest, isLocked, sectionOfField, sectionTitle } from "@/lib/locks";
import fs from "node:fs/promises";
import path from "node:path";

const MAX_TEXT = 20_000;

function auth(token: string): Client {
  const c = getClientByToken(token);
  if (!c) throw new Error("This link is no longer active.");
  return c;
}

function findField(c: Client, form: string, field: string): Field | undefined {
  return formsForClient(c.services)
    .find((f) => f.key === form)
    ?.sections.flatMap((s) => s.fields)
    .find((f) => f.key === field);
}

const str = (v: unknown) => String(v ?? "").slice(0, MAX_TEXT);

function clean(field: Field, value: unknown): unknown {
  switch (field.type) {
    case "checkboxes":
      return Array.isArray(value) ? value.map(String).filter((v) => field.options?.includes(v)) : [];
    case "colors":
      return Array.isArray(value) ? value.map(String).filter((v) => /^#[0-9a-f]{6}$/i.test(v)).slice(0, 12) : [];
    case "repeater":
      if (!Array.isArray(value)) return [];
      return value.slice(0, field.maxRows ?? 20).map((row) =>
        Object.fromEntries((field.columns ?? []).map((col) => [col.key, str((row as Record<string, unknown>)?.[col.key]).slice(0, 2000)])),
      );
    case "select":
      return field.options?.includes(String(value)) ? String(value) : "";
    case "file":
      throw new Error("Files are uploaded separately.");
    default:
      return str(value);
  }
}

export async function saveAnswerAction(token: string, form: string, fieldKey: string, value: unknown) {
  const c = auth(token);
  const field = findField(c, form, fieldKey);
  if (!field) throw new Error("Unknown field");
  if (isLocked(c.id, form, sectionOfField(form, fieldKey) ?? "")) throw new Error("This section is locked.");
  saveAnswer(c.id, form, fieldKey, clean(field, value), "client");
  return { ok: true };
}

export async function saveCredentialAction(
  token: string,
  data: { platform: string; login_url?: string; username?: string; password?: string; notes?: string; not_applicable?: boolean },
) {
  const c = auth(token);
  upsertCredential(
    c.id,
    {
      platform: str(data.platform).slice(0, 120),
      login_url: data.login_url === undefined ? undefined : str(data.login_url).slice(0, 500),
      username: data.username === undefined ? undefined : str(data.username).slice(0, 300),
      password: data.password ? str(data.password).slice(0, 500) : undefined,
      notes: data.notes === undefined ? undefined : str(data.notes).slice(0, 2000),
      not_applicable: data.not_applicable,
    },
    "client",
  );
  return listCredentials(c.id);
}

export async function removeCredentialAction(token: string, credId: number) {
  const c = auth(token);
  const row = listCredentials(c.id).find((r) => r.id === credId);
  // Default platforms can only be marked "don't have", not removed.
  if (row && !DEFAULT_PLATFORMS.includes(row.platform)) removeCredential(c.id, credId);
  return listCredentials(c.id);
}

export async function removeFileAction(token: string, fileId: number) {
  const c = auth(token);
  const f = getFile(fileId);
  if (!f || f.client_id !== c.id) return { ok: false };
  if (isLocked(c.id, f.form_key, sectionOfField(f.form_key, f.field_key) ?? "")) return { ok: false };
  removeFile(fileId);
  await fs.rm(path.join(UPLOAD_DIR, String(c.id), f.stored_name), { force: true });
  return { ok: true };
}

export async function submitAction(token: string) {
  const c = auth(token);
  submitClient(c.id);
  const fresh = getClientByToken(token)!;
  const b = getBranding();
  const recipients = b.notifyEmail.split(",").map((s) => s.trim()).filter(Boolean);
  if (recipients.length) {
    const pdf = await buildBriefPdf(fresh);
    const updated = fresh.version > 1 ? " (updated)" : "";
    await sendMail(
      recipients.join(","),
      `${fresh.company} submitted their onboarding${updated}`,
      `${fresh.company} has submitted their onboarding details${updated}.\n\nView: ${APP_URL}/admin/clients/${fresh.id}\n\nThe Client Brief PDF (no passwords) is attached.`,
      [{ filename: `${safeName(fresh.company)} - Client Brief v${fresh.version}.pdf`, content: Buffer.from(pdf) }],
    );
  }
  return { ok: true };
}

export async function requestChangeAction(token: string, form: string, section: string, message: string) {
  const c = auth(token);
  const msg = str(message).trim().slice(0, 2000);
  if (!msg) return { ok: false, error: "Please describe what needs to change." };
  const valid = formsForClient(c.services).find((f) => f.key === form)?.sections.some((s) => s.key === section);
  if (!valid || !isLocked(c.id, form, section)) return { ok: false, error: "This section is open. You can edit it directly." };
  createChangeRequest(c.id, form, section, msg);
  const b = getBranding();
  const to = b.notifyEmail.split(",").map((s) => s.trim()).filter(Boolean).join(",");
  if (to)
    await sendMail(
      to,
      `${c.company} asked to change: ${sectionTitle(form, section)}`,
      `${c.company} sent a change request for "${sectionTitle(form, section)}":

"${msg}"

Approve (unlocks the section for them) or decline:
${APP_URL}/admin/clients/${c.id}`,
    );
  return { ok: true };
}

const safeName = (s: string) => s.replace(/[^\w .-]+/g, "").trim() || "Client";
