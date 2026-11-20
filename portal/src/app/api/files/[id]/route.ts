import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { currentUser } from "@/lib/auth";
import { getClientByToken, getFile } from "@/lib/clients";
import { UPLOAD_DIR } from "@/lib/db";

/** Download a file: admins (session) or the owning client (?t=token). */
export async function GET(req: Request, { params }: RouteContext<"/api/files/[id]">) {
  const file = getFile(Number((await params).id));
  if (!file) return new Response("Not found", { status: 404 });

  const token = new URL(req.url).searchParams.get("t");
  const allowed = token ? getClientByToken(token)?.id === file.client_id : !!(await currentUser());
  if (!allowed) return new Response("Forbidden", { status: 403 });

  const p = path.join(UPLOAD_DIR, String(file.client_id), file.stored_name);
  if (!fs.existsSync(p)) return new Response("File missing", { status: 404 });

  // Images/PDF/video open inline; everything else downloads. Never render HTML/SVG inline.
  const inline = /^(image\/(png|jpe?g|gif|webp)|application\/pdf|video\/)/.test(file.mime);
  return new Response(Readable.toWeb(fs.createReadStream(p)) as ReadableStream, {
    headers: {
      "Content-Type": inline ? file.mime : "application/octet-stream",
      "Content-Length": String(file.size),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.original_name)}`,
      "X-Content-Type-Options": "nosniff",
      // Uploaded files are untrusted: never allow them to run scripts on this site.
      // (PDFs skip "sandbox" because Chrome's viewer refuses sandboxed PDFs; PDFs can't run page scripts anyway.)
      "Content-Security-Policy":
        file.mime === "application/pdf" ? "default-src 'none'; object-src 'self'" : "sandbox; default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'",
      "Cache-Control": "private, no-store",
    },
  });
}
