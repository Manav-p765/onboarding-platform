import "server-only";
import { db, logActivity } from "./db";
import { getClient, progress, type Client } from "./clients";
import { changesSince } from "./locks";
import { FORMS } from "./forms";
import { getBranding, notifyList, reminderSchedule } from "./settings";
import { APP_URL, EMAIL_ENABLED, sendMail } from "./mail";

const toDate = (s: string) => new Date(s.includes("T") ? s : s.replace(" ", "T") + "Z");
const daysSince = (s: string) => (Date.now() - toDate(s).getTime()) / 864e5;

/** Email the client a friendly list of what's still missing. Returns true if sent. */
export async function sendReminder(c: Client, actor: string): Promise<boolean> {
  if (!c.email || !c.link_active) return false;
  const b = getBranding();
  const p = progress(c);
  const lines = [
    ...p.missingRequired.map((l) => `• ${l}`),
    ...(p.credsPending.length ? [`• Logins for: ${p.credsPending.join(", ")}`] : []),
  ];
  const res = await sendMail(
    c.email,
    `${b.agencyName}: a few details still needed for ${c.company}`,
    `Hi ${c.contact_name || "there"},

Just a friendly reminder: your onboarding page is ${p.percent}% done.${lines.length ? `\n\nStill needed:\n${lines.join("\n")}` : ""}

Pick up where you left off (everything you've entered is saved):
${APP_URL}/c/${c.token}

Don't have something yet? Skip it and send what you have.

${b.agencyName}${b.supportPhone ? `\n${b.supportPhone}` : ""}`,
  );
  if (!res.ok) return false;
  db.prepare("UPDATE clients SET reminders_sent = reminders_sent + 1, last_reminder_at = datetime('now') WHERE id = ?").run(c.id);
  logActivity(c.id, actor, "sent reminder", `${p.percent}% complete`);
  return true;
}

/** Automatic reminders: N days after the invite, while the client hasn't submitted. */
export async function runReminders() {
  const b = getBranding();
  if (!b.remindersEnabled) return;
  const schedule = reminderSchedule(b);
  const rows = db
    .prepare(
      `SELECT id FROM clients WHERE link_active = 1 AND email != '' AND invited_at IS NOT NULL
       AND status IN ('not_started','in_progress') AND reminders_sent < ?`,
    )
    .all(schedule.length) as { id: number }[];
  for (const { id } of rows) {
    const c = getClient(id);
    if (!c?.invited_at) continue;
    const due = schedule[c.reminders_sent];
    const recentlyReminded = c.last_reminder_at && daysSince(c.last_reminder_at) < 0.8;
    if (due !== undefined && daysSince(c.invited_at) >= due && !recentlyReminded) await sendReminder(c, "system");
  }
}

/**
 * One summary email to the team when a client edits after submitting,
 * sent once they've stopped editing for 15 minutes (not one email per keystroke).
 */
export async function runChangeDigests() {
  const to = notifyList(getBranding());
  if (!to) return;
  const rows = db
    .prepare(
      `SELECT c.id, MAX(h.created_at) AS last_change FROM clients c
       JOIN answer_history h ON h.client_id = c.id AND h.actor = 'client'
       WHERE c.first_submitted_at IS NOT NULL AND h.created_at > COALESCE(c.changes_notified_at, c.first_submitted_at)
       GROUP BY c.id`,
    )
    .all() as { id: number; last_change: string }[];
  for (const r of rows) {
    if (Date.now() - toDate(r.last_change).getTime() < 15 * 60 * 1000) continue; // still editing
    const c = getClient(r.id);
    if (!c) continue;
    const changes = changesSince(c.id, c.changes_notified_at ?? c.first_submitted_at).filter((h) => h.actor === "client");
    const labels = [
      ...new Set(
        changes.map((h) => {
          const form = FORMS[h.form_key];
          const field = form?.sections.flatMap((s) => s.fields).find((f) => f.key === h.field_key);
          return `• ${form?.title ?? h.form_key}: ${field?.label ?? h.field_key}`;
        }),
      ),
    ];
    if (labels.length) {
      await sendMail(
        to,
        `${c.company} updated their details`,
        `${c.company} changed ${labels.length} answer${labels.length === 1 ? "" : "s"} after submitting:\n\n${labels.join("\n")}\n\nSee what changed (old values are shown):\n${APP_URL}/admin/clients/${c.id}`,
      );
      logActivity(c.id, "system", "emailed team about changes", `${labels.length} field(s)`);
    }
    db.prepare("UPDATE clients SET changes_notified_at = datetime('now') WHERE id = ?").run(c.id);
  }
}

export async function runAllJobs() {
  if (!EMAIL_ENABLED) return; // reminders & digests are email-only; the dashboard covers this when email is off
  try {
    await runReminders();
    await runChangeDigests();
  } catch (e) {
    console.error("[jobs] failed", e);
  }
}
