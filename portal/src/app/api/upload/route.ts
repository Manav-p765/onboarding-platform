import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { addFile, getClientByToken } from "@/lib/clients";
import { db, UPLOAD_DIR } from "@/lib/db";
import { formsForClient } from "@/lib/forms";
import { randomToken } from "@/lib/crypto";
import { isLocked, sectionOfField } from "@/lib/locks";

const MAX_UPLOAD = 200 * 1024 * 1024; // 200 MB per file (see SPEC)
const MAX_BYTES_PER_CLIENT = 3 * 1024 * 1024 * 1024; // 3 GB total per client
const MAX_FILES_PER_CLIENT = 300;
const BLOCKED_EXT = /\.(exe|bat|cmd|com|msi|scr|ps1|sh|js|vbs|jar|php|html?)$/i;

/** Streams the raw request body to disk (no full-file buffering in memory). */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const client = getClientByToken(url.searchParams.get("token") || "");
  if (!client) return Response.json({ error: "Link not active" }, { status: 403 });

  const form = url.searchParams.get("form") || "";
  const field = url.searchParams.get("field") || "";
  const name = (url.searchParams.get("name") || "file").replace(/[\\/:*?"<>|\x00-\x1f]+/g, "_").slice(0, 200);
  const def = formsForClient(client.services)
    .find((f) => f.key === form)
    ?.sections.flatMap((s) => s.fields)
    .find((f) => f.key === field);
  if (!def || def.type !== "file") return Response.json({ error: "Unknown field" }, { status: 400 });
  if (isLocked(client.id, form, sectionOfField(form, field) ?? "")) return Response.json({ error: "This section is locked." }, { status: 423 });
  if (BLOCKED_EXT.test(name)) return Response.json({ error: "This file type is not allowed." }, { status: 400 });

  // Per-client quota so one link can't fill the server's disk.
  const used = db.prepare("SELECT COALESCE(SUM(size), 0) AS bytes, COUNT(*) AS n FROM files WHERE client_id = ?").get(client.id) as {
    bytes: number;
    n: number;
  };
  if (used.n >= MAX_FILES_PER_CLIENT || used.bytes >= MAX_BYTES_PER_CLIENT)
    return Response.json({ error: "Upload limit reached for this account. Please share a Drive/Dropbox link instead." }, { status: 413 });

  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > MAX_UPLOAD) return Response.json({ error: "File is larger than 200 MB. Please share a Drive/Dropbox link instead." }, { status: 413 });
  if (!req.body) return Response.json({ error: "Empty file" }, { status: 400 });

  const dir = path.join(UPLOAD_DIR, String(client.id));
  fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(name).slice(0, 10).replace(/[^.\w]/g, "");
  const stored = `${Date.now()}-${randomToken(8)}${ext}`;
  const dest = path.join(dir, stored);

  let size = 0;
  const limiter = new Transform({
    transform(chunk, _enc, cb) {
      size += chunk.length;
      if (size > MAX_UPLOAD) cb(new Error("too large"));
      else cb(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(req.body as import("node:stream/web").ReadableStream), limiter, fs.createWriteStream(dest));
  } catch {
    fs.rmSync(dest, { force: true });
    return Response.json({ error: size > MAX_UPLOAD ? "File is larger than 200 MB." : "Upload failed" }, { status: 400 });
  }
  if (size === 0) {
    fs.rmSync(dest, { force: true });
    return Response.json({ error: "Empty file" }, { status: 400 });
  }

  const mime = (req.headers.get("content-type") || "application/octet-stream").slice(0, 100);
  const id = addFile(
    { client_id: client.id, form_key: form, field_key: field, original_name: name, stored_name: stored, mime, size },
    "client",
  );
  return Response.json({ id, original_name: name, size, form_key: form, field_key: field });
}
