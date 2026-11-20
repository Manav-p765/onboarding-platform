import Link from "next/link";
import { FORMS, SERVICE_KEYS } from "@/lib/forms";
import { NewClientForm } from "./NewClientForm";
import { EMAIL_ENABLED } from "@/lib/mail";

export default function NewClientPage() {
  const services = SERVICE_KEYS.map((k) => ({ key: k, title: FORMS[k].title, description: FORMS[k].description }));
  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/admin" className="text-sm font-medium text-muted hover:text-text">All clients</Link>
      <h1 className="mt-2 font-display text-3xl font-extrabold">New client</h1>
      <p className="mb-6 mt-1 text-muted">Add the basics. You&apos;ll get a private link and a ready-made welcome message to send them.</p>
      <NewClientForm services={services} emailEnabled={EMAIL_ENABLED} />
    </div>
  );
}
