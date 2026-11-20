"use client";

import { useActionState } from "react";
import { login, setup, type LoginState } from "./actions";

export function LoginForm({ mode }: { mode: "login" | "setup" }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(mode === "setup" ? setup : login, {});
  return (
    <form action={action} className="space-y-4">
      {mode === "setup" && (
        <div>
          <label className="label" htmlFor="name">Your name</label>
          <input id="name" name="name" className="input" required />
        </div>
      )}
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" className="input" autoComplete="username" required />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          className="input"
          autoComplete={mode === "setup" ? "new-password" : "current-password"}
          required
        />
        {mode === "setup" && <p className="help">At least 10 characters.</p>}
      </div>
      {state.error && <p className="text-sm text-danger" role="alert">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "Please wait…" : mode === "setup" ? "Create admin account" : "Log in"}
      </button>
    </form>
  );
}
