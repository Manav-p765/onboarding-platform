"use client";

import { useActionState } from "react";
import { saveSettingsAction, type SettingsState } from "../actions";

type B = {
  agencyName: string;
  logoUrl: string;
  primaryColor: string;
  supportEmail: string;
  supportPhone: string;
  notifyEmail: string;
  remindersEnabled: boolean;
  reminderDays: string;
};

export function SettingsForm({ b, emailEnabled }: { b: B; emailEnabled: boolean }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveSettingsAction, {});
  return (
    <form action={action} className="card space-y-5">
      <div>
        <label className="label" htmlFor="agencyName">Agency name</label>
        <input id="agencyName" name="agencyName" defaultValue={b.agencyName} className="input" />
        <p className="help">Shown to clients on their page and in emails.</p>
      </div>
      <div>
        <label className="label" htmlFor="logo">Logo</label>
        {b.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.logoUrl} alt="Current logo" className="mb-2 h-10 w-auto" />
        )}
        <input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="text-sm" />
        {b.logoUrl && (
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" name="removeLogo" className="accent-brand" /> Remove logo
          </label>
        )}
      </div>
      <div>
        <label className="label" htmlFor="primaryColor">Brand color</label>
        <div className="flex items-center gap-2">
          <input type="color" defaultValue={b.primaryColor} className="h-9 w-12 rounded border border-line"
            onChange={(e) => ((e.target.nextElementSibling as HTMLInputElement).value = e.target.value)} aria-label="Pick color" />
          <input id="primaryColor" name="primaryColor" defaultValue={b.primaryColor} className="input w-32 font-mono" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="supportEmail">Support email (shown to clients)</label>
          <input id="supportEmail" name="supportEmail" type="email" defaultValue={b.supportEmail} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="supportPhone">Support phone (shown to clients)</label>
          <input id="supportPhone" name="supportPhone" defaultValue={b.supportPhone} className="input" />
        </div>
      </div>
      {emailEnabled ? (
      <>
      <div>
        <label className="label" htmlFor="notifyEmail">Notify this email when a client submits</label>
        <input id="notifyEmail" name="notifyEmail" defaultValue={b.notifyEmail} className="input" placeholder="you@agency.com, partner@agency.com" />
        <p className="help">Separate multiple emails with commas. The Client Brief PDF is attached.</p>
      </div>
      <fieldset className="rounded-xl border border-line p-4">
        <legend className="px-1 font-display font-bold">Reminders</legend>
        <label className="flex items-center gap-2 text-[15px]">
          <input type="checkbox" name="remindersEnabled" defaultChecked={b.remindersEnabled} className="size-4 accent-brand" />
          Email clients who haven&apos;t finished, listing what&apos;s still missing
        </label>
        <div className="mt-3">
          <label className="label" htmlFor="reminderDays">Send on these days after the invite</label>
          <input id="reminderDays" name="reminderDays" defaultValue={b.reminderDays} className="input w-40" placeholder="3,7" />
          <p className="help">Comma-separated, e.g. 3,7 sends one reminder on day 3 and another on day 7. Stops once the client sends their details.</p>
        </div>
      </fieldset>
      </>
      ) : (
        <p className="rounded-xl bg-sunken p-4 text-[15px] text-muted ring-1 ring-line">
          Email is turned off. Share links and reminders with the copy-message buttons on each client. New activity and change
          requests show up on the Clients page.
          <input type="hidden" name="notifyEmail" value={b.notifyEmail} />
          <input type="hidden" name="reminderDays" value={b.reminderDays} />
          {b.remindersEnabled && <input type="hidden" name="remindersEnabled" value="on" />}
        </p>
      )}
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      {state.ok && <p className="text-sm text-ok">Saved.</p>}
      <div className="flex justify-end"><button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save settings"}</button></div>
    </form>
  );
}
