import "server-only";
import { db } from "./db";

/** White-label branding. Clients only ever see these values. */
export type Branding = {
  agencyName: string;
  logoUrl: string; // path served from /api/brand-logo or external URL
  primaryColor: string;
  supportEmail: string;
  supportPhone: string;
  notifyEmail: string; // where "client submitted" alerts go
  remindersEnabled: boolean;
  reminderDays: string; // e.g. "3,7" = days after the invite
};

const DEFAULTS: Branding = {
  agencyName: "Your Agency",
  logoUrl: "",
  primaryColor: "#0b4a8b",
  supportEmail: "",
  supportPhone: "",
  notifyEmail: "",
  remindersEnabled: true,
  reminderDays: "3,7",
};

export function reminderSchedule(b: Branding): number[] {
  return b.reminderDays
    .split(",")
    .map((d) => Number(d.trim()))
    .filter((n) => Number.isFinite(n) && n > 0 && n <= 90)
    .sort((a, b) => a - b)
    .slice(0, 5);
}

export function notifyList(b: Branding): string {
  return b.notifyEmail.split(",").map((s) => s.trim()).filter(Boolean).join(",");
}

export function getBranding(): Branding {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'branding'").get() as { value: string } | undefined;
  return { ...DEFAULTS, ...(row ? (JSON.parse(row.value) as Partial<Branding>) : {}) };
}

export function saveBranding(b: Partial<Branding>) {
  const next = { ...getBranding(), ...b };
  db.prepare(
    "INSERT INTO settings (key, value) VALUES ('branding', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(JSON.stringify(next));
}
