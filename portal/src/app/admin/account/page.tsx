import { connection } from "next/server";
import { currentUser, getUserRow } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PasswordForm, TwoFactor } from "./AccountForms";

export default async function AccountPage() {
  await connection();
  const me = await currentUser();
  if (!me) redirect("/login");
  const row = getUserRow(me.id)!;
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold">My account</h1>
        <p className="mt-1 text-muted">{me.name} · {me.email}</p>
      </div>
      <PasswordForm forced={!!me.must_change_password} />
      <TwoFactor enabled={!!row.totp_enabled} />
    </div>
  );
}
