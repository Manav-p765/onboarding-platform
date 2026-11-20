import { currentUser } from "@/lib/auth";
import { getClient, listClients } from "@/lib/clients";
import { logActivity } from "@/lib/db";
import { buildWorkbook } from "@/lib/excel";

/** GET /api/admin/export/excel           → all clients
 *  GET /api/admin/export/excel?client=ID → one client */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const id = new URL(req.url).searchParams.get("client");
  const clients = id ? [getClient(Number(id))].filter((c) => c !== null) : listClients();
  if (id && !clients.length) return new Response("Not found", { status: 404 });

  const buf = await buildWorkbook(clients);
  const date = new Date().toISOString().slice(0, 10);
  const name = id
    ? `${clients[0].company.replace(/[^\w .-]+/g, "").trim() || "Client"} - details ${date}.xlsx`
    : `All clients - onboarding details ${date}.xlsx`;
  logActivity(id ? Number(id) : null, user.email, "exported Excel", id ? "" : `${clients.length} clients`);

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
