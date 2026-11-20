"use client";

import { useActionState, useState, useTransition } from "react";
import { CopyButton } from "@/components/CopyButton";
import {
  addUserAction,
  removeUserAction,
  resetPasswordAction,
  resetTwoFactorAction,
  type AddUserState,
} from "./actions";

function TempPassword({ email, password }: { email: string; password: string }) {
  return (
    <div className="rounded-xl border border-ok/30 bg-ok/5 p-4">
      <p className="font-semibold">Login ready for {email}</p>
      <p className="mt-1 text-sm text-muted">Share this temporary password privately (a call or chat, not email). They&apos;ll be asked to set their own after logging in.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="rounded-lg bg-white px-3 py-2 font-mono text-[15px] ring-1 ring-line">{password}</code>
        <CopyButton text={password} label="Copy password" />
      </div>
    </div>
  );
}

export function AddUserForm({ canMakeSuper }: { canMakeSuper: boolean }) {
  const [state, action, pending] = useActionState<AddUserState, FormData>(addUserAction, {});
  return (
    <form action={action} className="card space-y-4">
      <h2 className="font-display text-lg font-bold">Add a login</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="u-name">Name</label>
          <input id="u-name" name="name" className="input" required />
        </div>
        <div>
          <label className="label" htmlFor="u-email">Email</label>
          <input id="u-email" name="email" type="email" className="input" required />
        </div>
      </div>
      {canMakeSuper && (
        <fieldset>
          <legend className="label">Access</legend>
          <div className="flex flex-wrap gap-4 text-[15px]">
            <label className="flex items-center gap-2"><input type="radio" name="role" value="admin" defaultChecked className="accent-brand" /> Admin</label>
            <label className="flex items-center gap-2"><input type="radio" name="role" value="super" className="accent-brand" /> Super Admin (can manage everyone)</label>
          </div>
        </fieldset>
      )}
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      {state.created && <TempPassword email={state.created.email} password={state.created.password} />}
      <div className="flex justify-end"><button className="btn-primary" disabled={pending}>{pending ? "Adding…" : "Add login"}</button></div>
    </form>
  );
}

export function UserRowActions({ id, email, has2fa }: { id: number; email: string; has2fa: boolean }) {
  const [pending, start] = useTransition();
  const [temp, setTemp] = useState<string | null>(null);
  const [error, setError] = useState("");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap justify-end gap-2">
        <button
          className="btn-ghost min-h-9 px-3 py-1.5 text-sm"
          disabled={pending}
          onClick={() =>
            confirm(`Give ${email} a new temporary password? They'll be signed out.`) &&
            start(async () => {
              const r = await resetPasswordAction(id);
              if (r.ok) setTemp(r.password);
            })
          }
        >
          Reset password
        </button>
        {has2fa && (
          <button
            className="btn-ghost min-h-9 px-3 py-1.5 text-sm"
            disabled={pending}
            onClick={() => confirm(`Turn off 2-step login for ${email}? Use this if they lost their phone.`) && start(async () => void (await resetTwoFactorAction(id)))}
          >
            Reset 2-step login
          </button>
        )}
        <button
          className="btn-danger min-h-9 px-3 py-1.5 text-sm"
          disabled={pending}
          onClick={() =>
            confirm(`Remove ${email}'s login?`) &&
            start(async () => {
              const r = await removeUserAction(id);
              if (!r.ok) setError(r.error ?? "Not removed.");
            })
          }
        >
          Remove
        </button>
      </div>
      {error && <p className="text-right text-sm text-danger">{error}</p>}
      {temp && <TempPassword email={email} password={temp} />}
    </div>
  );
}
