import type { Metadata } from "next";
import { connection } from "next/server";
import { getAnswers, getClientByToken, listCredentials, listFiles } from "@/lib/clients";
import { formsForClient } from "@/lib/forms";
import { getBranding } from "@/lib/settings";
import { BrandStyle } from "@/components/BrandStyle";
import { listChangeRequests, listLocks } from "@/lib/locks";
import { ClientPortal } from "./ClientPortal";

export async function generateMetadata(): Promise<Metadata> {
  return { title: `Onboarding · ${getBranding().agencyName}`, referrer: "no-referrer" };
}

export default async function ClientPage({ params }: PageProps<"/c/[token]">) {
  await connection();
  const { token } = await params;
  const client = getClientByToken(token);
  const b = getBranding();

  if (!client) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <BrandStyle />
        <div className="card max-w-md text-center">
          <h1 className="text-lg font-semibold">This link isn&apos;t active</h1>
          <p className="mt-2 text-sm text-muted">
            Please contact {b.agencyName}
            {b.supportEmail ? ` at ${b.supportEmail}` : ""} for a new link.
          </p>
        </div>
      </main>
    );
  }

  return (
    <>
      <BrandStyle />
      <ClientPortal
        token={token}
        branding={{ agencyName: b.agencyName, logoUrl: b.logoUrl, supportEmail: b.supportEmail, supportPhone: b.supportPhone }}
        client={{ company: client.company, contact_name: client.contact_name, status: client.status, submitted: !!client.submitted_at }}
        forms={formsForClient(client.services)}
        answers={getAnswers(client.id)}
        files={listFiles(client.id).map((f) => ({ id: f.id, form_key: f.form_key, field_key: f.field_key, original_name: f.original_name, size: f.size }))}
        credentials={listCredentials(client.id)}
        locks={[...listLocks(client.id)]}
        requests={listChangeRequests(client.id).map((r) => ({
          id: r.id,
          form_key: r.form_key,
          section_key: r.section_key,
          status: r.status,
          message: r.message,
          admin_note: r.admin_note,
        }))}
      />
    </>
  );
}
