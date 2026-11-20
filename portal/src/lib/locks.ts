import "server-only";
import { db, logActivity } from "./db";
import { FORMS } from "./forms";

// ---------- locks ----------
// A locked section means "the team is working from these answers". The client can
// still see them, but must send a change request instead of editing.

export type LockKey = `${string}.${string}`; // form.section

export function listLocks(clientId: number): Set<LockKey> {
  const rows = db.prepare("SELECT form_key, section_key FROM locks WHERE client_id = ?").all(clientId) as {
    form_key: string;
    section_key: string;
  }[];
  return new Set(rows.map((r) => `${r.form_key}.${r.section_key}` as LockKey));
}

export function isLocked(clientId: number, form: string, section: string): boolean {
  return !!db.prepare("SELECT 1 FROM locks WHERE client_id = ? AND form_key = ? AND section_key = ?").get(clientId, form, section);
}

export function sectionOfField(form: string, field: string): string | undefined {
  return FORMS[form]?.sections.find((s) => s.fields.some((f) => f.key === field))?.key;
}

export function setLock(clientId: number, form: string, section: string, locked: boolean, actor: string) {
  if (locked) {
    db.prepare("INSERT OR IGNORE INTO locks (client_id, form_key, section_key, locked_by) VALUES (?, ?, ?, ?)").run(clientId, form, section, actor);
  } else {
    db.prepare("DELETE FROM locks WHERE client_id = ? AND form_key = ? AND section_key = ?").run(clientId, form, section);
  }
  logActivity(clientId, actor, locked ? "locked" : "unlocked", sectionTitle(form, section));
}

export function lockAll(clientId: number, sections: { form: string; section: string }[], actor: string) {
  const ins = db.prepare("INSERT OR IGNORE INTO locks (client_id, form_key, section_key, locked_by) VALUES (?, ?, ?, ?)");
  db.transaction(() => sections.forEach((s) => ins.run(clientId, s.form, s.section, actor)))();
  logActivity(clientId, actor, "locked all sections");
}

export function unlockAll(clientId: number, actor: string) {
  db.prepare("DELETE FROM locks WHERE client_id = ?").run(clientId);
  logActivity(clientId, actor, "unlocked all sections");
}

export function sectionTitle(form: string, section: string) {
  const f = FORMS[form];
  return `${f?.title ?? form}: ${f?.sections.find((s) => s.key === section)?.title ?? section}`;
}

// ---------- change requests ----------

export type ChangeRequest = {
  id: number;
  client_id: number;
  form_key: string;
  section_key: string;
  message: string;
  status: "pending" | "approved" | "declined";
  admin_note: string;
  resolved_by: string | null;
  created_at: string;
  resolved_at: string | null;
};

export function createChangeRequest(clientId: number, form: string, section: string, message: string) {
  const info = db
    .prepare("INSERT INTO change_requests (client_id, form_key, section_key, message) VALUES (?, ?, ?, ?)")
    .run(clientId, form, section, message);
  logActivity(clientId, "client", "requested a change", sectionTitle(form, section));
  return Number(info.lastInsertRowid);
}

export function listChangeRequests(clientId: number): ChangeRequest[] {
  return db.prepare("SELECT * FROM change_requests WHERE client_id = ? ORDER BY id DESC").all(clientId) as ChangeRequest[];
}

export function pendingRequestCounts(): Map<number, number> {
  const rows = db.prepare("SELECT client_id, COUNT(*) AS n FROM change_requests WHERE status = 'pending' GROUP BY client_id").all() as {
    client_id: number;
    n: number;
  }[];
  return new Map(rows.map((r) => [r.client_id, r.n]));
}

export function getChangeRequest(id: number): ChangeRequest | null {
  return (db.prepare("SELECT * FROM change_requests WHERE id = ?").get(id) as ChangeRequest | undefined) ?? null;
}

/** Approve = unlock that section so the client can make the change themselves. */
export function resolveChangeRequest(id: number, approve: boolean, note: string, actor: string): ChangeRequest | null {
  const cr = getChangeRequest(id);
  if (!cr || cr.status !== "pending") return null;
  db.prepare("UPDATE change_requests SET status = ?, admin_note = ?, resolved_by = ?, resolved_at = datetime('now') WHERE id = ?").run(
    approve ? "approved" : "declined",
    note,
    actor,
    id,
  );
  if (approve) setLock(cr.client_id, cr.form_key, cr.section_key, false, actor);
  logActivity(cr.client_id, actor, approve ? "approved change request" : "declined change request", sectionTitle(cr.form_key, cr.section_key));
  return getChangeRequest(id);
}

// ---------- change history ----------

export type HistoryRow = { form_key: string; field_key: string; old_value: string | null; new_value: string; actor: string; created_at: string };

export function recordHistory(clientId: number, form: string, field: string, oldJson: string | null, newJson: string, actor: string) {
  // Collapse rapid edits of the same field (typing) into one history row.
  const last = db
    .prepare("SELECT id, created_at FROM answer_history WHERE client_id = ? AND form_key = ? AND field_key = ? ORDER BY id DESC LIMIT 1")
    .get(clientId, form, field) as { id: number; created_at: string } | undefined;
  const boundary = (db.prepare("SELECT first_submitted_at FROM clients WHERE id = ?").get(clientId) as { first_submitted_at: string | null } | undefined)
    ?.first_submitted_at;
  const recent =
    last &&
    Date.now() - new Date(last.created_at.replace(" ", "T") + "Z").getTime() < 10 * 60 * 1000 &&
    // keep the pre-submission value intact so "Was:" shows what the team originally received
    (!boundary || last.created_at > boundary);
  if (recent) {
    db.prepare("UPDATE answer_history SET new_value = ?, created_at = datetime('now') WHERE id = ?").run(newJson, last!.id);
  } else {
    db.prepare("INSERT INTO answer_history (client_id, form_key, field_key, old_value, new_value, actor) VALUES (?, ?, ?, ?, ?, ?)").run(
      clientId,
      form,
      field,
      oldJson,
      newJson,
      actor,
    );
  }
}

/** Fields the client changed after a given time (e.g. after first submission). */
export function changesSince(clientId: number, since: string | null): HistoryRow[] {
  if (!since) return [];
  return db
    .prepare(
      `SELECT form_key, field_key, old_value, new_value, actor, created_at FROM answer_history
       WHERE client_id = ? AND created_at > ? ORDER BY id`,
    )
    .all(clientId, since) as HistoryRow[];
}

/** Earliest known previous value per field, for "changed from" display. */
export function changedFieldMap(clientId: number, since: string | null): Map<string, { from: unknown; at: string }> {
  const out = new Map<string, { from: unknown; at: string }>();
  for (const r of changesSince(clientId, since)) {
    const k = `${r.form_key}.${r.field_key}`;
    if (!out.has(k)) out.set(k, { from: r.old_value ? JSON.parse(r.old_value) : "", at: r.created_at });
    else out.get(k)!.at = r.created_at;
  }
  return out;
}
