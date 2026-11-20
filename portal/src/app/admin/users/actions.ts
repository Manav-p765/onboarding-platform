"use server";

import { refresh } from "next/cache";
import QRCode from "qrcode";
import {
  checkPassword,
  confirmTotp,
  createUser,
  deleteUser,
  endOtherSessions,
  getUserRow,
  listUsers,
  pendingTotpSecret,
  requireUser,
  resetTotp,
  setPassword,
  verifyUserTotp,
  type User,
} from "@/lib/auth";
import { db, logActivity } from "@/lib/db";
import { otpauthUrl } from "@/lib/totp";
import { getBranding } from "@/lib/settings";
import { randomInt } from "node:crypto";

/** Readable temporary password, e.g. "harbor-velvet-4821-Kq". */
function tempPassword() {
  const words = "amber,cedar,delta,ember,falcon,harbor,ivory,juniper,lunar,maple,nova,orbit,quartz,raven,summit,tango,velvet,willow".split(",");
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
  return `${words[randomInt(words.length)]}-${words[randomInt(words.length)]}-${randomInt(1000, 10000)}-${letters[randomInt(letters.length)]}${letters[randomInt(letters.length)]}`;
}

/** Super Admin can manage everyone; an Admin can manage Admins only. */
function canManage(actor: User, target: { role: User["role"] }) {
  return actor.role === "super" || target.role === "admin";
}

export type AddUserState = { error?: string; created?: { email: string; password: string } };

export async function addUserAction(_: AddUserState, form: FormData): Promise<AddUserState> {
  const me = await requireUser();
  const name = String(form.get("name") || "").trim();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const role = form.get("role") === "super" && me.role === "super" ? "super" : "admin";
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a name and a valid email." };
  if (listUsers().some((u) => u.email === email)) return { error: "Someone already has a login with that email." };
  const password = tempPassword();
  await createUser(email, name, password, role, true);
  logActivity(null, me.email, "added user", `${email} (${role})`);
  refresh();
  return { created: { email, password } };
}

export async function removeUserAction(id: number) {
  const me = await requireUser();
  const target = getUserRow(id);
  if (!target || target.id === me.id || !canManage(me, target)) return { ok: false, error: "You can't remove this user." };
  if (target.role === "super" && listUsers().filter((u) => u.role === "super").length <= 1)
    return { ok: false, error: "There must always be at least one Super Admin." };
  deleteUser(id);
  logActivity(null, me.email, "removed user", target.email);
  refresh();
  return { ok: true };
}

export async function resetPasswordAction(id: number) {
  const me = await requireUser();
  const target = getUserRow(id);
  if (!target || target.id === me.id || !canManage(me, target)) return { ok: false as const };
  const password = tempPassword();
  await setPassword(id, password, true);
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id); // sign them out everywhere
  logActivity(null, me.email, "reset password", target.email);
  refresh();
  return { ok: true as const, password };
}

export async function resetTwoFactorAction(id: number) {
  const me = await requireUser();
  const target = getUserRow(id);
  if (!target || target.id === me.id || !canManage(me, target)) return { ok: false };
  resetTotp(id);
  logActivity(null, me.email, "reset 2-step login", target.email);
  refresh();
  return { ok: true };
}

// ---------- my account ----------

export type PasswordState = { error?: string; ok?: boolean };

export async function changePasswordAction(_: PasswordState, form: FormData): Promise<PasswordState> {
  const me = await requireUser();
  const current = String(form.get("current") || "");
  const next = String(form.get("next") || "");
  if (!(await checkPassword(me.id, current))) return { error: "Your current password is wrong." };
  if (next.length < 10) return { error: "New password must be at least 10 characters." };
  if (next !== String(form.get("confirm") || "")) return { error: "The new passwords don't match." };
  await setPassword(me.id, next, false);
  await endOtherSessions(me.id);
  logActivity(null, me.email, "changed password");
  refresh();
  return { ok: true };
}

export async function startTwoFactorAction() {
  const me = await requireUser();
  const secret = pendingTotpSecret(me.id);
  const url = otpauthUrl(secret, me.email, getBranding().agencyName || "Onboarding");
  return { secret, qr: await QRCode.toDataURL(url, { margin: 1, width: 220 }) };
}

export async function confirmTwoFactorAction(code: string) {
  const me = await requireUser();
  const ok = confirmTotp(me.id, code);
  if (ok) {
    logActivity(null, me.email, "turned on 2-step login");
    refresh();
  }
  return { ok };
}

export async function disableTwoFactorAction(code: string) {
  const me = await requireUser();
  if (!verifyUserTotp(me.id, code)) return { ok: false };
  resetTotp(me.id);
  logActivity(null, me.email, "turned off 2-step login");
  refresh();
  return { ok: true };
}
