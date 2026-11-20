import { connection } from "next/server";
import { redirect } from "next/navigation";
import { currentUser, userCount } from "@/lib/auth";
import { BrandMark, BrandStyle } from "@/components/BrandStyle";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  await connection();
  if (await currentUser()) redirect("/admin");
  const mode = userCount() === 0 ? "setup" : "login";
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <BrandStyle />
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <BrandMark />
        </div>
        <div className="card">
          <h1 className="mb-1 font-display text-2xl font-bold">{mode === "setup" ? "First-time setup" : "Admin login"}</h1>
          <p className="mb-5 text-sm text-muted">
            {mode === "setup" ? "Create the main admin account." : "Sign in to manage client onboarding."}
          </p>
          <LoginForm mode={mode} />
        </div>
      </div>
    </main>
  );
}
