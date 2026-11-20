import { connection } from "next/server";
import { getBranding } from "@/lib/settings";
import { SettingsForm } from "./SettingsForm";
import { EMAIL_ENABLED } from "@/lib/mail";

export default async function SettingsPage() {
  await connection();
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 font-display text-3xl font-extrabold">Settings</h1>
      <p className="mb-6 text-sm text-muted">Clients see this name, logo and color on their page and in the messages you copy. Nothing else is shown to them.</p>
      <SettingsForm b={getBranding()} emailEnabled={EMAIL_ENABLED} />
    </div>
  );
}
