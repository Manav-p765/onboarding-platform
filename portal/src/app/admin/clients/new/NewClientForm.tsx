"use client";

import { useActionState } from "react";
import { createClientAction, type NewClientState } from "../../actions";

export function NewClientForm({ services, emailEnabled }: { services: { key: string; title: string; description: string }[]; emailEnabled: boolean }) {
  const [state, action, pending] = useActionState<NewClientState, FormData>(createClientAction, {});
  return (
    <form action={action} className="card space-y-5">
      <div>
        <label className="label" htmlFor="company">Company name *</label>
        <input id="company" name="company" className="input" required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="contact_name">Contact person</label>
          <input id="contact_name" name="contact_name" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="email">Contact email</label>
          <input id="email" name="email" type="email" className="input" />
          <p className="help">The onboarding link is sent here.</p>
        </div>
      </div>
      <fieldset>
        <legend className="label">Services (forms the client will fill in)</legend>
        <p className="help mb-2 mt-0">Company Profile and Logins are always included.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {services.map((s) => (
            <label key={s.key} className="flex cursor-pointer gap-3 rounded-lg border border-line p-3 has-checked:border-brand has-checked:bg-brand/5">
              <input type="checkbox" name="services" value={s.key} defaultChecked={s.key === "website" || s.key === "seo"} className="mt-0.5 accent-brand" />
              <span>
                <span className="block text-sm font-medium">{s.title}</span>
                <span className="block text-xs text-muted">{s.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {emailEnabled && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="send_now" className="accent-brand" /> Email the onboarding link now
        </label>
      )}
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <div className="flex justify-end">
        <button className="btn-primary" disabled={pending}>{pending ? "Creating…" : "Create client"}</button>
      </div>
    </form>
  );
}
