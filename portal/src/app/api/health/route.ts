import { db } from "@/lib/db";

/** Used by the Docker healthcheck. */
export function GET() {
  db.prepare("SELECT 1").get();
  return Response.json({ ok: true });
}
