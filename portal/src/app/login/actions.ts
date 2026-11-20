"use server";

import { redirect } from "next/navigation";
import {
  completeChallenge,
  createUser,
  endSession,
  lockedFor,
  startChallenge,
  startSession,
  userCount,
  verifyLogin,
} from "@/lib/auth";
import { logActivity } from "@/lib/db";

export type LoginState = { error?: string };

export async function login(_: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") || "");
  const mins = lockedFor(email);
  if (mins) return { error: `Too many wrong attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.` };
  const user = await verifyLogin(email, String(form.get("password") || ""));
  if (!user) return { error: "Wrong email or password." };
  if (user.totp_enabled) {
    await startChallenge(user.id);
    redirect("/login/verify");
  }
  await startSession(user.id);
  logActivity(null, user.email, "login");
  redirect("/admin");
}

export async function verifyCode(_: LoginState, form: FormData): Promise<LoginState> {
  const user = await completeChallenge(String(form.get("code") || ""));
  if (!user) return { error: "That code didn't work. Check your authenticator app and try again." };
  await startSession(user.id);
  logActivity(null, user.email, "login", "with 2-step code");
  redirect("/admin");
}

/** First run only: creates the Super Admin when no users exist yet. */
export async function setup(_: LoginState, form: FormData): Promise<LoginState> {
  if (userCount() > 0) return { error: "Setup already done. Please log in." };
  const email = String(form.get("email") || "").trim();
  const name = String(form.get("name") || "").trim();
  const password = String(form.get("password") || "");
  if (!email.includes("@") || !name) return { error: "Name and a valid email are required." };
  if (password.length < 10) return { error: "Password must be at least 10 characters." };
  await createUser(email, name, password, "super");
  const user = await verifyLogin(email, password);
  await startSession(user!.id);
  redirect("/admin");
}

export async function logout() {
  await endSession();
  redirect("/login");
}
