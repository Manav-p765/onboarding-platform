"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import fs from "node:fs/promises";
import path from "node:path";
import { requireUser } from "@/lib/auth";
import {
  createClient,
  deleteClient,
  getClient,
  markInvited,
  regenerateLink,
  revealPassword,
  setLinkActive,
  updateClientMeta,
  type ClientStatus,
} from "@/lib/clients";
import { DATA_DIR, logActivity } from "@/lib/db";
import { SERVICE_KEYS } from "@/lib/forms";
import { getBranding, saveBranding } from "@/lib/settings";
import { APP_URL, sendMail } from "@/lib/mail";
import { lockAll, resolveChangeRequest, sectionTitle, setLock, unlockAll } from "@/lib/locks";
import { formsForClient } from "@/lib/forms";
import { sendReminder } from "@/lib/jobs";

const validServices = (form: FormData) =>
  form.getAll("services").map(String).filter((s) => (SERVICE_KEYS as readonly string[]).includes(s));

export type NewClientState = { error?: string };

export async function createClientAction(_: NewClientState, form: FormData): Promise<NewClientState> {
  const user = await requireUser();
  const company = String(form.get("company") || "").trim();
  if (!company) return { error: "Company name is required." };
  const id = createClient(
    {
      company,
      contact_name: String(form.get("contact_name") || ""),
      email: String(form.get("email") || ""),
      services: validServices(form),
    },
    user.email,
  );
  if (form.get("send_now") === "on") await sendInvite(id, user.email);
  redirect(`/admin/clients/${id}`);
}

async function sendInvite(id: number, actor: string) {
  const c = getClient(id);
  if (!c?.email) return { ok: false, reason: "Client has no email address." };
  const b = getBranding();
  const link = `${APP_URL}/c/${c.token}`;
  const res = await sendMail(
    c.email,
    `${b.agencyName}: let's get your project started`,
    `Hi ${c.contact_name || "there"},

Welcome aboard! To get started, we need a few details about your business.

Open your private onboarding page here:
${link}

It saves automatically, so you can stop and come back any time using the same link.
Skip anything you don't have yet. You can add it later.

${b.supportEmail || b.supportPhone ? `Questions? ${[b.supportEmail, b.supportPhone].filter(Boolean).join(" · ")}` : ""}

${b.agencyName}`,
  );
  if (res.ok) {
    markInvited(id);
    logActivity(id, actor, "sent invite", c.email);
  }
  return res;
}

export async function sendInviteAction(id: number) {
  const user = await requireUser();
  const res = await sendInvite(id, user.email);
  refresh();
  return res;
}

export async function updateClientAction(id: number, form: FormData) {
  await requireUser();
  updateClientMeta(id, {
    company: String(form.get("company") || "").trim() || undefined,
    contact_name: String(form.get("contact_name") || ""),
    email: String(form.get("email") || ""),
    services: validServices(form),
  });
  refresh();
}

export async function setStatusAction(id: number, status: ClientStatus) {
  const user = await requireUser();
  if (!["not_started", "in_progress", "submitted", "in_work", "complete"].includes(status)) return;
  updateClientMeta(id, { status });
  logActivity(id, user.email, "status", status);
  refresh();
}

export async function regenerateLinkAction(id: number) {
  const user = await requireUser();
  regenerateLink(id);
  logActivity(id, user.email, "new link", "Old link disabled");
  refresh();
}

export async function toggleLinkAction(id: number, active: boolean) {
  const user = await requireUser();
  setLinkActive(id, active);
  logActivity(id, user.email, active ? "link enabled" : "link disabled");
  refresh();
}

export async function deleteClientAction(id: number) {
  const user = await requireUser();
  await fs.rm(path.join(DATA_DIR, "uploads", String(id)), { recursive: true, force: true });
  deleteClient(id);
  logActivity(null, user.email, "deleted client", String(id));
  redirect("/admin");
}

export async function revealPasswordAction(clientId: number, credId: number) {
  const user = await requireUser();
  return revealPassword(clientId, credId, user.email);
}

export async function markLinkSharedAction(id: number) {
  const user = await requireUser();
  const c = getClient(id);
  if (!c) return;
  if (!c.invited_at) logActivity(id, user.email, "copied welcome message");
  markInvited(id);
}

export async function sendReminderAction(id: number) {
  const user = await requireUser();
  const c = getClient(id);
  const ok = c ? await sendReminder(c, user.email) : false;
  refresh();
  return { ok };
}

// ---------- locking & change requests ----------

export async function setLockAction(clientId: number, form: string, section: string, locked: boolean) {
  const user = await requireUser();
  setLock(clientId, form, section, locked, user.email);
  refresh();
}

export async function lockAllAction(clientId: number, locked: boolean) {
  const user = await requireUser();
  const c = getClient(clientId);
  if (!c) return;
  if (locked) {
    lockAll(
      clientId,
      formsForClient(c.services).flatMap((f) => f.sections.map((s) => ({ form: f.key, section: s.key }))),
      user.email,
    );
  } else unlockAll(clientId, user.email);
  refresh();
}

export async function resolveRequestAction(id: number, approve: boolean, note: string) {
  const user = await requireUser();
  const cr = resolveChangeRequest(id, approve, note.trim().slice(0, 1000), user.email);
  if (cr) {
    const c = getClient(cr.client_id);
    const b = getBranding();
    if (c?.email && c.link_active) {
      const where = sectionTitle(cr.form_key, cr.section_key);
      await sendMail(
        c.email,
        approve ? `You can now update "${where}"` : `About your change request: ${where}`,
        approve
          ? `Hi ${c.contact_name || "there"},\n\nWe've opened "${where}" so you can make your change.\n\nUpdate it here (it saves automatically):\n${APP_URL}/c/${c.token}\n\n${b.agencyName}`
          : `Hi ${c.contact_name || "there"},\n\nWe've looked at your request to change "${where}" and we're keeping it as is for now.${note ? `\n\n${note}` : ""}\n\nQuestions? Just reply or contact us.\n\n${b.agencyName}`,
      );
    }
  }
  refresh();
}

// ---------- settings ----------

export type SettingsState = { ok?: boolean; error?: string };

export async function saveSettingsAction(_: SettingsState, form: FormData): Promise<SettingsState> {
  const user = await requireUser();
  const color = String(form.get("primaryColor") || "");
  if (color && !/^#[0-9a-f]{6}$/i.test(color)) return { error: "Color must look like #0b4a8b." };
  const patch: Parameters<typeof saveBranding>[0] = {
    agencyName: String(form.get("agencyName") || "").trim() || "Your Agency",
    primaryColor: color || "#0b4a8b",
    supportEmail: String(form.get("supportEmail") || "").trim(),
    supportPhone: String(form.get("supportPhone") || "").trim(),
    notifyEmail: String(form.get("notifyEmail") || "").trim(),
    remindersEnabled: form.get("remindersEnabled") === "on",
    reminderDays: String(form.get("reminderDays") || "3,7").replace(/[^\d,]/g, "") || "3,7",
  };
  const logo = form.get("logo");
  if (logo instanceof File && logo.size > 0) {
    if (!/^image\/(png|jpeg|svg\+xml|webp)$/.test(logo.type)) return { error: "Logo must be PNG, JPG, SVG or WebP." };
    if (logo.size > 2 * 1024 * 1024) return { error: "Logo must be under 2 MB." };
    const dir = path.join(DATA_DIR, "brand");
    await fs.mkdir(dir, { recursive: true });
    const ext = { "image/png": "png", "image/jpeg": "jpg", "image/svg+xml": "svg", "image/webp": "webp" }[logo.type]!;
    for (const f of await fs.readdir(dir)) await fs.rm(path.join(dir, f));
    await fs.writeFile(path.join(dir, `logo.${ext}`), Buffer.from(await logo.arrayBuffer()));
    patch.logoUrl = `/api/brand-logo?v=${Date.now()}`;
  }
  if (form.get("removeLogo") === "on") patch.logoUrl = "";
  saveBranding(patch);
  logActivity(null, user.email, "updated settings");
  refresh();
  return { ok: true };
}
