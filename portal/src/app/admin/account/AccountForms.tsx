"use client";

import { useActionState, useState, useTransition } from "react";
import { changePasswordAction, confirmTwoFactorAction, disableTwoFactorAction, startTwoFactorAction, type PasswordState } from "../users/actions";

export function PasswordForm({ forced }: { forced: boolean }) {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePasswordAction, {});
  return (
    <form action={action} className="card space-y-4">
      <div>
        <h2 className="font-display text-lg font-bold">{forced ? "Set your own password" : "Change password"}</h2>
        {forced && <p className="mt-1 text-[15px] text-muted">You&apos;re using a temporary password. Choose your own to continue.</p>}
      </div>
      <div>
        <label className="label" htmlFor="current">{forced ? "Temporary password" : "Current password"}</label>
        <input id="current" name="current" type="password" className="input" autoComplete="current-password" required />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="next">New password</label>
          <input id="next" name="next" type="password" className="input" autoComplete="new-password" minLength={10} required />
          <p className="help">At least 10 characters.</p>
        </div>
        <div>
          <label className="label" htmlFor="confirm">Repeat new password</label>
          <input id="confirm" name="confirm" type="password" className="input" autoComplete="new-password" required />
        </div>
      </div>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      {state.ok && <p className="text-sm text-ok">Password changed. Other devices were signed out.</p>}
      <div className="flex justify-end"><button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save password"}</button></div>
    </form>
  );
}

export function TwoFactor({ enabled }: { enabled: boolean }) {
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  if (enabled)
    return (
      <div className="card space-y-3">
        <h2 className="font-display text-lg font-bold">2-step login is on</h2>
        <p className="text-[15px] text-muted">Each login asks for a code from your authenticator app. To turn it off, enter a current code.</p>
        <div className="flex flex-wrap gap-2">
          <input className="input w-40 text-center tracking-widest" inputMode="numeric" placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Current code" />
          <button
            className="btn-ghost"
            disabled={pending || code.length < 6}
            onClick={() => start(async () => setMsg((await disableTwoFactorAction(code)).ok ? "" : "That code didn't work."))}
          >
            Turn off
          </button>
        </div>
        {msg && <p className="text-sm text-danger">{msg}</p>}
      </div>
    );

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="font-display text-lg font-bold">2-step login</h2>
        <p className="mt-1 text-[15px] text-muted">
          Strongly recommended: this portal stores client passwords. After your password, you&apos;ll also enter a 6-digit code from
          an app on your phone (Google Authenticator, Microsoft Authenticator, 1Password…).
        </p>
      </div>
      {!setup ? (
        <button className="btn-primary" disabled={pending} onClick={() => start(async () => setSetup(await startTwoFactorAction()))}>
          Set up 2-step login
        </button>
      ) : (
        <div className="grid gap-5 sm:grid-cols-[220px_1fr]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={setup.qr} alt="QR code to scan with your authenticator app" className="size-[220px] rounded-xl ring-1 ring-line" />
          <div className="space-y-3">
            <ol className="list-decimal space-y-1 pl-5 text-[15px]">
              <li>Open your authenticator app and add an account.</li>
              <li>Scan this QR code. Can&apos;t scan? Type this key instead:</li>
            </ol>
            <code className="block break-all rounded-lg bg-sunken px-3 py-2 font-mono text-sm ring-1 ring-line">{setup.secret.match(/.{1,4}/g)?.join(" ")}</code>
            <label className="label" htmlFor="totp-code">3. Enter the 6-digit code it shows</label>
            <div className="flex gap-2">
              <input id="totp-code" className="input w-40 text-center tracking-widest" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
              <button
                className="btn-primary"
                disabled={pending || code.replace(/\D/g, "").length !== 6}
                onClick={() => start(async () => setMsg((await confirmTwoFactorAction(code)).ok ? "" : "That code didn't match. Check the time on your phone and try again."))}
              >
                Turn on
              </button>
            </div>
            {msg && <p className="text-sm text-danger">{msg}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
