"use client";

import Link from "next/link";
import { useActionState } from "react";
import { verifyCode, type LoginState } from "../actions";

export function CodeForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(verifyCode, {});
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="code">6-digit code</label>
        <input
          id="code"
          name="code"
          className="input text-center font-display text-2xl tracking-[0.4em]"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          maxLength={7}
          autoFocus
          required
        />
      </div>
      {state.error && <p className="text-sm text-danger" role="alert">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Checking…" : "Log in"}</button>
      <p className="text-center text-sm text-muted">
        Lost your phone? Ask another admin to reset your 2-step login. <Link href="/login" className="text-brand underline">Start over</Link>
      </p>
    </form>
  );
}
