import { currentUser } from "@/lib/auth";
import { getClient } from "@/lib/clients";
import { logActivity } from "@/lib/db";
import { buildBriefPdf } from "@/lib/pdf";

export async function GET(_req: Request, { params }: RouteContext<"/api/admin/clients/[id]/brief">) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const client = getClient(Number((await params).id));
  if (!client) return new Response("Not found", { status: 404 });
  const pdf = await buildBriefPdf(client);
  logActivity(client.id, user.email, "downloaded brief PDF");
  const name = `${client.company.replace(/[^\w .-]+/g, "").trim() || "Client"} - Client Brief v${Math.max(client.version, 1)}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
