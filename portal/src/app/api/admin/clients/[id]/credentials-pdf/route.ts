import { currentUser } from "@/lib/auth";
import { getClient } from "@/lib/clients";
import { logActivity } from "@/lib/db";
import { buildCredentialsPdf, qpdfAvailable } from "@/lib/pdf";

/** POST with form field "pdf_password". Returns an AES-256 encrypted PDF of logins. */
export async function POST(req: Request, { params }: RouteContext<"/api/admin/clients/[id]/credentials-pdf">) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const client = getClient(Number((await params).id));
  if (!client) return new Response("Not found", { status: 404 });

  const form = await req.formData();
  const pw = String(form.get("pdf_password") || "");
  if (pw.length < 8 || /[\r\n]/.test(pw)) return new Response("PDF password must be at least 8 characters.", { status: 400 });
  if (!(await qpdfAvailable()))
    return new Response("Password-protected PDFs need the 'qpdf' tool installed on the server (apt install qpdf).", { status: 501 });

  const pdf = await buildCredentialsPdf(client, pw);
  logActivity(client.id, user.email, "generated credentials PDF");
  const name = `${client.company.replace(/[^\w .-]+/g, "").trim() || "Client"} - Credentials (protected).pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
