import "server-only";
import nodemailer from "nodemailer";

export const APP_URL = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

/**
 * Email is OFF unless SMTP_HOST is set. The agency chose not to use email:
 * admins share links and reminders themselves (copy-message buttons), and
 * team alerts show on the dashboard. The code stays ready if that changes.
 */
export const EMAIL_ENABLED = !!process.env.SMTP_HOST;

export async function sendMail(to: string, subject: string, text: string, attachments?: { filename: string; content: Buffer }[]) {
  if (!EMAIL_ENABLED) return { ok: false, reason: "Email is turned off" };
  if (!to) return { ok: false, reason: "no recipient" };
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  try {
    await transport.sendMail({ from: process.env.MAIL_FROM, to, subject, text, attachments });
    return { ok: true };
  } catch (e) {
    console.error("[mail] send failed", e);
    return { ok: false, reason: (e as Error).message };
  }
}

// ---------- ready-to-paste messages (used when email is off) ----------

export function inviteMessage(agency: string, contact: string, link: string) {
  return `Hi ${contact || "there"}, welcome aboard! To get started, please fill in your details here: ${link}

It saves as you go, so you can stop and come back any time with the same link. Skip anything you don't have yet.

- ${agency}`;
}

export function reminderMessage(agency: string, contact: string, link: string, percent: number, missing: string[]) {
  return `Hi ${contact || "there"}, a quick reminder from ${agency}: your onboarding page is ${percent}% done.${
    missing.length ? `\n\nStill needed:\n${missing.map((m) => `• ${m}`).join("\n")}` : ""
  }

Pick up where you left off (everything is saved): ${link}`;
}

export function approvedMessage(contact: string, section: string, link: string) {
  return `Hi ${contact || "there"}, we've opened "${section}" so you can make your change. Update it here (it saves automatically): ${link}`;
}
