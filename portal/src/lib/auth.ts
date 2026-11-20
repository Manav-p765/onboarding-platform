import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db, logActivity } from "./db";
import { decrypt, encrypt, randomToken } from "./crypto";
import { generateSecret, verifyTotp } from "./totp";

export const SESSION_COOKIE = "portal_session";
export const CHALLENGE_COOKIE = "portal_2fa";
const SESSION_DAYS = 14;
const DUMMY_HASH = bcrypt.hashSync("timing-equalizer", 12);
const cookieBase = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };

export type User = { id: number; email: string; name: string; role: "super" | "admin" };
export type UserRow = User & { totp_enabled: number; must_change_password: number; created_at: string };

export function userCount(): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
}

export function listUsers(): UserRow[] {
  return db.prepare("SELECT id, email, name, role, totp_enabled, must_change_password, created_at FROM users ORDER BY id").all() as UserRow[];
}

export function getUserRow(id: number): UserRow | null {
  return (
    (db.prepare("SELECT id, email, name, role, totp_enabled, must_change_password, created_at FROM users WHERE id = ?").get(id) as
      | UserRow
      | undefined) ?? null
  );
}

export async function createUser(email: string, name: string, password: string, role: User["role"], mustChange = false) {
  const hash = await bcrypt.hash(password, 12);
  db.prepare("INSERT INTO users (email, name, password_hash, role, must_change_password) VALUES (?, ?, ?, ?, ?)").run(
    email.trim().toLowerCase(),
    name.trim(),
    hash,
    role,
    mustChange ? 1 : 0,
  );
}

export function deleteUser(id: number) {
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
}

export async function setPassword(userId: number, password: string, mustChange = false) {
  const hash = await bcrypt.hash(password, 12);
  db.prepare("UPDATE users SET password_hash = ?, must_change_password = ? WHERE id = ?").run(hash, mustChange ? 1 : 0, userId);
}

export async function checkPassword(userId: number, password: string): Promise<boolean> {
  const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(userId) as { password_hash: string } | undefined;
  return bcrypt.compare(password, row?.password_hash ?? DUMMY_HASH);
}

/** Sign out every session of a user except (optionally) the current one. */
export async function endOtherSessions(userId: number, keepCurrent = true) {
  const current = keepCurrent ? (await cookies()).get(SESSION_COOKIE)?.value : undefined;
  db.prepare("DELETE FROM sessions WHERE user_id = ? AND id != ?").run(userId, current ?? "");
}

// ---------- brute-force protection ----------
// 5 wrong passwords for an email → that email is locked for 15 minutes.

const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

export function lockedFor(email: string): number {
  const row = db.prepare("SELECT locked_until FROM login_failures WHERE key = ?").get(email.trim().toLowerCase()) as
    | { locked_until: string | null }
    | undefined;
  if (!row?.locked_until) return 0;
  const ms = new Date(row.locked_until).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 60000) : 0;
}

function recordFailure(email: string) {
  const key = email.trim().toLowerCase();
  const row = db.prepare("SELECT count, first_at FROM login_failures WHERE key = ?").get(key) as { count: number; first_at: string } | undefined;
  const fresh = !row || Date.now() - new Date(row.first_at).getTime() > LOCK_MINUTES * 60000;
  const count = fresh ? 1 : row!.count + 1;
  const locked = count >= MAX_FAILS ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null;
  db.prepare(
    `INSERT INTO login_failures (key, count, first_at, locked_until) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET count = excluded.count, first_at = excluded.first_at, locked_until = excluded.locked_until`,
  ).run(key, count, fresh ? new Date().toISOString() : row!.first_at, locked);
  if (locked) logActivity(null, key, "login locked", `${MAX_FAILS} failed attempts`);
}

function clearFailures(email: string) {
  db.prepare("DELETE FROM login_failures WHERE key = ?").run(email.trim().toLowerCase());
}

export async function verifyLogin(email: string, password: string): Promise<(User & { totp_enabled: number }) | null> {
  const row = db
    .prepare("SELECT id, email, name, role, password_hash, totp_enabled FROM users WHERE email = ?")
    .get(email.trim().toLowerCase()) as (User & { password_hash: string; totp_enabled: number }) | undefined;
  // Always run a compare so timing doesn't reveal whether the email exists.
  const ok = await bcrypt.compare(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !ok) {
    recordFailure(email);
    return null;
  }
  clearFailures(email);
  return { id: row.id, email: row.email, name: row.name, role: row.role, totp_enabled: row.totp_enabled };
}

// ---------- two-step login (password, then 6-digit code) ----------

export async function startChallenge(userId: number) {
  const id = randomToken(32);
  const expires = new Date(Date.now() + 5 * 60000);
  db.prepare("DELETE FROM login_challenges WHERE user_id = ? OR expires_at < ?").run(userId, new Date().toISOString());
  db.prepare("INSERT INTO login_challenges (id, user_id, expires_at) VALUES (?, ?, ?)").run(id, userId, expires.toISOString());
  (await cookies()).set(CHALLENGE_COOKIE, id, { ...cookieBase, expires });
}

export async function pendingChallenge(): Promise<{ id: string; user: UserRow } | null> {
  const id = (await cookies()).get(CHALLENGE_COOKIE)?.value;
  if (!id) return null;
  const row = db.prepare("SELECT user_id, expires_at, attempts FROM login_challenges WHERE id = ?").get(id) as
    | { user_id: number; expires_at: string; attempts: number }
    | undefined;
  if (!row || new Date(row.expires_at) < new Date() || row.attempts >= 5) return null;
  const user = getUserRow(row.user_id);
  return user ? { id, user } : null;
}

/** Returns the user when the code is right; counts wrong attempts (max 5). */
export async function completeChallenge(code: string): Promise<User | null> {
  const ch = await pendingChallenge();
  if (!ch) return null;
  const secret = userTotpSecret(ch.user.id);
  if (!secret || !verifyTotp(secret, code)) {
    db.prepare("UPDATE login_challenges SET attempts = attempts + 1 WHERE id = ?").run(ch.id);
    return null;
  }
  db.prepare("DELETE FROM login_challenges WHERE id = ?").run(ch.id);
  (await cookies()).delete(CHALLENGE_COOKIE);
  return { id: ch.user.id, email: ch.user.email, name: ch.user.name, role: ch.user.role };
}

// ---------- 2FA setup ----------

function userTotpSecret(userId: number): string | null {
  const row = db.prepare("SELECT totp_secret_enc FROM users WHERE id = ?").get(userId) as { totp_secret_enc: string | null } | undefined;
  return row?.totp_secret_enc ? decrypt(row.totp_secret_enc) : null;
}

/** Creates (or returns the not-yet-confirmed) secret while setting up. */
export function pendingTotpSecret(userId: number): string {
  const row = db.prepare("SELECT totp_secret_enc, totp_enabled FROM users WHERE id = ?").get(userId) as {
    totp_secret_enc: string | null;
    totp_enabled: number;
  };
  if (row.totp_secret_enc && !row.totp_enabled) return decrypt(row.totp_secret_enc);
  const secret = generateSecret();
  db.prepare("UPDATE users SET totp_secret_enc = ?, totp_enabled = 0 WHERE id = ?").run(encrypt(secret), userId);
  return secret;
}

export function confirmTotp(userId: number, code: string): boolean {
  const secret = userTotpSecret(userId);
  if (!secret || !verifyTotp(secret, code)) return false;
  db.prepare("UPDATE users SET totp_enabled = 1 WHERE id = ?").run(userId);
  return true;
}

export function verifyUserTotp(userId: number, code: string): boolean {
  const secret = userTotpSecret(userId);
  return !!secret && verifyTotp(secret, code);
}

export function resetTotp(userId: number) {
  db.prepare("UPDATE users SET totp_secret_enc = NULL, totp_enabled = 0 WHERE id = ?").run(userId);
}

// ---------- sessions ----------

export async function startSession(userId: number) {
  const id = randomToken(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(new Date().toISOString());
  db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").run(id, userId, expires.toISOString());
  (await cookies()).set(SESSION_COOKIE, id, { ...cookieBase, expires });
}

export async function endSession() {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (id) db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  jar.delete(SESSION_COOKIE);
}

export async function currentUser(): Promise<(User & { must_change_password: number }) | null> {
  const id = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!id) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, u.must_change_password, s.expires_at FROM sessions s
       JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
    )
    .get(id) as (User & { expires_at: string; must_change_password: number }) | undefined;
  if (!row || new Date(row.expires_at) < new Date()) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role, must_change_password: row.must_change_password };
}

/** Use at the top of every admin page / action. */
export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}
