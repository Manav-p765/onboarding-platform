import fs from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "@/lib/db";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", svg: "image/svg+xml", webp: "image/webp" };

export async function GET() {
  const dir = path.join(DATA_DIR, "brand");
  const file = (await fs.readdir(dir).catch(() => [] as string[])).find((f) => f.startsWith("logo."));
  if (!file) return new Response("Not found", { status: 404 });
  const ext = file.split(".").pop()!;
  return new Response(new Uint8Array(await fs.readFile(path.join(dir, file))), {
    headers: {
      "Content-Type": TYPES[ext] ?? "application/octet-stream",
      "Cache-Control": "public, max-age=86400",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
