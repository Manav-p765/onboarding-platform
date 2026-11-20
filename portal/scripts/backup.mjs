// Consistent snapshot of the SQLite DB + uploads, kept for 14 days.
// Run inside the container:  node scripts/backup.mjs
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const DATA = process.env.DATA_DIR || "/data";
const OUT = path.join(DATA, "backups");
const KEEP_DAYS = 14;
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
fs.mkdirSync(OUT, { recursive: true });

// 1. database (safe while the app is running)
const dbFile = path.join(OUT, `portal-${stamp}.db`);
await new Database(path.join(DATA, "portal.db"), { readonly: true }).backup(dbFile);

// 2. uploads + brand logo
const tarFile = path.join(OUT, `files-${stamp}.tar.gz`);
execFileSync("tar", ["-czf", tarFile, "-C", DATA, "uploads", "brand"].filter((x) => x !== "brand" || fs.existsSync(path.join(DATA, "brand"))));

// 3. prune old backups
const cutoff = Date.now() - KEEP_DAYS * 864e5;
for (const f of fs.readdirSync(OUT)) {
  const p = path.join(OUT, f);
  if (fs.statSync(p).mtimeMs < cutoff) fs.rmSync(p);
}
console.log(`backup ok: ${path.basename(dbFile)}, ${path.basename(tarFile)}`);

// 4. optional offsite copy (off unless BACKUP_REMOTE is set), via rclone.
//    Works with Backblaze B2, Cloudflare R2, S3, Google Drive, etc. Configure the remote with
//    RCLONE_CONFIG_<NAME>_* environment variables (see deploy/.env.example).
//    Tip: use an rclone "crypt" remote so files are encrypted before they leave the server.
const remote = process.env.BACKUP_REMOTE; // e.g. "offsite:onboard-backups"
if (remote) {
  for (const f of [dbFile, tarFile]) execFileSync("rclone", ["copy", f, remote, "--no-traverse"], { stdio: "inherit" });
  // keep 30 days offsite
  execFileSync("rclone", ["delete", remote, "--min-age", "30d"], { stdio: "inherit" });
  console.log(`offsite copy ok: ${remote}`);
}
