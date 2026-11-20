import { connection } from "next/server";
import { redirect } from "next/navigation";
import { pendingChallenge } from "@/lib/auth";
import { BrandMark, BrandStyle } from "@/components/BrandStyle";
import { CodeForm } from "./CodeForm";

export default async function VerifyPage() {
  await connection();
  const ch = await pendingChallenge();
  if (!ch) redirect("/login");
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <BrandStyle />
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <BrandMark />
        </div>
        <div className="card">
          <h1 className="mb-1 font-display text-2xl font-bold">Enter your code</h1>
          <p className="mb-5 text-sm text-muted">Open your authenticator app and enter the 6-digit code for this portal.</p>
          <CodeForm />
        </div>
      </div>
    </main>
  );
}
