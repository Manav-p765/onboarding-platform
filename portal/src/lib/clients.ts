import "server-only";
import { db, logActivity } from "./db";
import { randomToken, encrypt, decrypt } from "./crypto";
import { recordHistory } from "./locks";
import { allFields, DEFAULT_PLATFORMS, formsForClient, isFilled, type AnswerMap } from "./forms";

export type ClientStatus = "not_started" | "in_progress" | "submitted" | "in_work" | "complete";
export const STATUS_LABEL: Record<ClientStatus, string> = {
  not_started: "Not opened",
  in_progress: "Filling in",
  submitted: "Ready to review",
  in_work: "In work",
  complete: "Complete",
};

export type Client = {
  id: number;
  company: string;
  contact_name: string;
  email: string;
  token: string;
  link_active: number;
  services: string[];
  status: ClientStatus;
  version: number;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  first_submitted_at: string | null;
  invited_at: string | null;
  reminders_sent: number;
  last_reminder_at: string | null;
  changes_notified_at: string | null;
  admin_seen_at: string | null;
};

export type FileRow = {
  id: number;
  client_id: number;
  form_key: string;
  field_key: string;
  original_name: string;
  stored_name: string;
  mime: string;
  size: number;
  created_at: string;
};

export type CredentialRow = {
  id: number;
  platform: string;
  login_url: string;
  username: string;
  has_password: boolean;
  notes: string;
  not_applicable: boolean;
  updated_at: string;
};

type RawClient = Omit<Client, "services"> & { services: string };
const parse = (r: RawClient | undefined): Client | null => (r ? { ...r, services: JSON.parse(r.services) } : null);

export function listClients(): Client[] {
  return (db.prepare("SELECT * FROM clients ORDER BY updated_at DESC").all() as RawClient[]).map((r) => parse(r)!);
}

export function getClient(id: number): Client | null {
  return parse(db.prepare("SELECT * FROM clients WHERE id = ?").get(id) as RawClient | undefined);
}

/** Only returns the client when the link is active. */
export function getClientByToken(token: string): Client | null {
  if (!token || token.length < 20) return null;
  return parse(db.prepare("SELECT * FROM clients WHERE token = ? AND link_active = 1").get(token) as RawClient | undefined);
}

export function createClient(input: { company: string; contact_name: string; email: string; services: string[] }, actor: string) {
  const token = randomToken(24);
  const info = db
    .prepare("INSERT INTO clients (company, contact_name, email, token, services) VALUES (?, ?, ?, ?, ?)")
    .run(input.company.trim(), input.contact_name.trim(), input.email.trim(), token, JSON.stringify(input.services));
  const id = Number(info.lastInsertRowid);
  // Pre-fill the profile with what the admin already knows, so the client types less.
  saveAnswer(id, "profile", "company", input.company.trim(), null);
  if (input.contact_name.trim()) saveAnswer(id, "profile", "contact_name", input.contact_name.trim(), null);
  if (input.email.trim()) saveAnswer(id, "profile", "email", input.email.trim(), null);
  const ins = db.prepare("INSERT INTO credentials (client_id, platform) VALUES (?, ?)");
  for (const p of DEFAULT_PLATFORMS) ins.run(id, p);
  logActivity(id, actor, "created", `Services: ${input.services.join(", ") || "profile only"}`);
  return id;
}

export function updateClientMeta(id: number, patch: Partial<Pick<Client, "company" | "contact_name" | "email" | "services" | "status">>) {
  const c = getClient(id);
  if (!c) return;
  const n = { ...c, ...patch };
  db.prepare(
    "UPDATE clients SET company=?, contact_name=?, email=?, services=?, status=?, updated_at=datetime('now') WHERE id=?",
  ).run(n.company, n.contact_name, n.email, JSON.stringify(n.services), n.status, id);
}

export function regenerateLink(id: number) {
  db.prepare("UPDATE clients SET token = ?, link_active = 1 WHERE id = ?").run(randomToken(24), id);
}

export function setLinkActive(id: number, active: boolean) {
  db.prepare("UPDATE clients SET link_active = ? WHERE id = ?").run(active ? 1 : 0, id);
}

export function deleteClient(id: number) {
  db.prepare("DELETE FROM clients WHERE id = ?").run(id);
}

// ---------- answers ----------

export function getAnswers(clientId: number): AnswerMap {
  const rows = db.prepare("SELECT form_key, field_key, value FROM answers WHERE client_id = ?").all(clientId) as {
    form_key: string;
    field_key: string;
    value: string;
  }[];
  const out: AnswerMap = {};
  for (const r of rows) (out[r.form_key] ??= {})[r.field_key] = JSON.parse(r.value);
  return out;
}

/** Returns true if the value actually changed. actor=null means system prefill (no log). */
export function saveAnswer(clientId: number, form: string, field: string, value: unknown, actor: string | null): boolean {
  const prev = db
    .prepare("SELECT value FROM answers WHERE client_id = ? AND form_key = ? AND field_key = ?")
    .get(clientId, form, field) as { value: string } | undefined;
  const json = JSON.stringify(value ?? "");
  if (prev?.value === json) return false;
  db.prepare(
    `INSERT INTO answers (client_id, form_key, field_key, value) VALUES (?, ?, ?, ?)
     ON CONFLICT(client_id, form_key, field_key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
  ).run(clientId, form, field, json);
  if (actor) touch(clientId); // system prefill doesn't count as the client starting
  if (actor) recordHistory(clientId, form, field, prev?.value ?? null, json, actor);
  return true;
}

function touch(clientId: number) {
  db.prepare(
    "UPDATE clients SET updated_at = datetime('now'), status = CASE WHEN status = 'not_started' THEN 'in_progress' ELSE status END WHERE id = ?",
  ).run(clientId);
}

// ---------- files ----------

export function listFiles(clientId: number): FileRow[] {
  return db.prepare("SELECT * FROM files WHERE client_id = ? ORDER BY created_at").all(clientId) as FileRow[];
}

export function getFile(id: number): FileRow | null {
  return (db.prepare("SELECT * FROM files WHERE id = ?").get(id) as FileRow | undefined) ?? null;
}

export function addFile(f: Omit<FileRow, "id" | "created_at">, actor: string) {
  const info = db
    .prepare(
      "INSERT INTO files (client_id, form_key, field_key, original_name, stored_name, mime, size) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(f.client_id, f.form_key, f.field_key, f.original_name, f.stored_name, f.mime, f.size);
  touch(f.client_id);
  logActivity(f.client_id, actor, "uploaded", f.original_name);
  return Number(info.lastInsertRowid);
}

export function removeFile(id: number) {
  db.prepare("DELETE FROM files WHERE id = ?").run(id);
}

// ---------- credentials ----------

export function listCredentials(clientId: number): CredentialRow[] {
  const rows = db.prepare("SELECT * FROM credentials WHERE client_id = ? ORDER BY id").all(clientId) as (Omit<
    CredentialRow,
    "has_password" | "not_applicable"
  > & { password_enc: string; not_applicable: number })[];
  return rows.map(({ password_enc, ...r }) => ({ ...r, has_password: !!password_enc, not_applicable: !!r.not_applicable }));
}

export function upsertCredential(
  clientId: number,
  c: { platform: string; login_url?: string; username?: string; password?: string; notes?: string; not_applicable?: boolean },
  actor: string,
) {
  const platform = c.platform.trim().slice(0, 120);
  if (!platform) return;
  db.prepare("INSERT OR IGNORE INTO credentials (client_id, platform) VALUES (?, ?)").run(clientId, platform);
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (c.login_url !== undefined) {
    sets.push("login_url = ?");
    vals.push(c.login_url);
  }
  if (c.username !== undefined) {
    sets.push("username = ?");
    vals.push(c.username);
  }
  // Empty password = keep existing (client never sees the stored one).
  if (c.password) {
    sets.push("password_enc = ?");
    vals.push(encrypt(c.password));
  }
  if (c.notes !== undefined) {
    sets.push("notes = ?");
    vals.push(c.notes);
  }
  if (c.not_applicable !== undefined) {
    sets.push("not_applicable = ?");
    vals.push(c.not_applicable ? 1 : 0);
  }
  if (!sets.length) return;
  db.prepare(`UPDATE credentials SET ${sets.join(", ")}, updated_at = datetime('now') WHERE client_id = ? AND platform = ?`).run(
    ...vals,
    clientId,
    platform,
  );
  touch(clientId);
  logActivity(clientId, actor, "updated login", platform);
}

export function removeCredential(clientId: number, credId: number) {
  db.prepare("DELETE FROM credentials WHERE id = ? AND client_id = ?").run(credId, clientId);
}

/** Admin only. Logs every reveal. */
export function revealPassword(clientId: number, credId: number, actor: string): string {
  const row = db.prepare("SELECT platform, password_enc FROM credentials WHERE id = ? AND client_id = ?").get(credId, clientId) as
    | { platform: string; password_enc: string }
    | undefined;
  if (!row) return "";
  logActivity(clientId, actor, "revealed password", row.platform);
  return decrypt(row.password_enc);
}

export function allPasswords(clientId: number): { platform: string; login_url: string; username: string; password: string; notes: string }[] {
  const rows = db
    .prepare("SELECT platform, login_url, username, password_enc, notes FROM credentials WHERE client_id = ? AND not_applicable = 0 ORDER BY id")
    .all(clientId) as { platform: string; login_url: string; username: string; password_enc: string; notes: string }[];
  return rows
    .filter((r) => r.username || r.password_enc || r.notes)
    .map((r) => ({ platform: r.platform, login_url: r.login_url, username: r.username, password: decrypt(r.password_enc), notes: r.notes }));
}

// ---------- progress ----------

export function progress(client: Client, answers = getAnswers(client.id), files = listFiles(client.id), creds = listCredentials(client.id)) {
  const fields = allFields(formsForClient(client.services));
  let done = 0;
  const missingRequired: string[] = [];
  for (const { form, field } of fields) {
    const filled = field.type === "file" ? files.some((f) => f.form_key === form && f.field_key === field.key) : isFilled(answers[form]?.[field.key]);
    if (filled) done++;
    else if (field.required) missingRequired.push(field.label);
  }
  const credDone = creds.filter((c) => c.not_applicable || c.username || c.has_password).length;
  const total = fields.length + creds.length;
  return {
    percent: total ? Math.round(((done + credDone) / total) * 100) : 0,
    missingRequired,
    credsPending: creds.filter((c) => !c.not_applicable && !c.username && !c.has_password).map((c) => c.platform),
  };
}

export function markSeen(clientId: number) {
  db.prepare("UPDATE clients SET admin_seen_at = datetime('now') WHERE id = ?").run(clientId);
}

/** Client did something since an admin last looked (edit, upload, submit). */
export function hasNewActivity(c: Client): boolean {
  if (c.status === "not_started") return false;
  const last = db
    .prepare("SELECT MAX(created_at) AS t FROM activity WHERE client_id = ? AND actor = 'client'")
    .get(c.id) as { t: string | null };
  const lastHist = db
    .prepare("SELECT MAX(created_at) AS t FROM answer_history WHERE client_id = ? AND actor = 'client'")
    .get(c.id) as { t: string | null };
  const t = [last.t, lastHist.t].filter(Boolean).sort().pop();
  return !!t && (!c.admin_seen_at || t > c.admin_seen_at);
}

export function markInvited(clientId: number) {
  db.prepare("UPDATE clients SET invited_at = COALESCE(invited_at, datetime('now')) WHERE id = ?").run(clientId);
}

export function submitClient(clientId: number) {
  db.prepare(
    "UPDATE clients SET status = CASE WHEN status IN ('not_started','in_progress') THEN 'submitted' ELSE status END, submitted_at = datetime('now'), first_submitted_at = COALESCE(first_submitted_at, datetime('now')), changes_notified_at = datetime('now'), version = version + 1, updated_at = datetime('now') WHERE id = ?",
  ).run(clientId);
  logActivity(clientId, "client", "submitted");
}

export function recentActivity(clientId: number, limit = 50) {
  return db
    .prepare("SELECT actor, action, detail, created_at FROM activity WHERE client_id = ? ORDER BY id DESC LIMIT ?")
    .all(clientId, limit) as { actor: string; action: string; detail: string; created_at: string }[];
}
