"use client";

import { useState, useTransition } from "react";
import {
  deleteClientAction,
  regenerateLinkAction,
  revealPasswordAction,
  markLinkSharedAction,
  sendInviteAction,
  sendReminderAction,
  setStatusAction,
  toggleLinkAction,
} from "../../actions";
import type { ClientStatus } from "@/lib/clients";
import { CopyButton } from "@/components/CopyButton";

const STATUSES: [ClientStatus, string][] = [
  ["not_started", "Not opened"],
  ["in_progress", "Filling in"],
  ["submitted", "Ready to review"],
  ["in_work", "In work"],
  ["complete", "Complete"],
];

export function StatusSelect({ id, status }: { id: number; status: ClientStatus }) {
  const [pending, start] = useTransition();
  return (
    <select
      className="input w-auto py-1.5"
      defaultValue={status}
      disabled={pending}
      onChange={(e) => start(() => setStatusAction(id, e.target.value as ClientStatus))}
      aria-label="Status"
    >
      {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

export function LinkBox({
  id,
  link,
  active,
  hasEmail,
  emailEnabled,
  inviteText,
  reminderText,
}: {
  id: number;
  link: string;
  active: boolean;
  hasEmail: boolean;
  emailEnabled: boolean;
  inviteText: string;
  reminderText: string;
}) {
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input readOnly value={active ? link : "Link disabled"} className="input font-mono text-xs" onFocus={(e) => e.target.select()} />
        <button
          className="btn-ghost shrink-0"
          disabled={!active}
          onClick={async () => {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {!emailEnabled && active && (
          <>
            <CopyButton className="btn-primary" text={inviteText} label="Copy welcome message" onCopied={() => markLinkSharedAction(id)} />
            <CopyButton text={reminderText} label="Copy reminder message" />
          </>
        )}
        {emailEnabled && (
        <>
        <button
          className="btn-primary"
          disabled={pending || !active || !hasEmail}
          title={hasEmail ? "" : "Add the client's email first"}
          onClick={() =>
            start(async () => {
              const r = await sendInviteAction(id);
              setMsg(r.ok ? "Invite sent." : `Not sent: ${"reason" in r ? r.reason : ""}`);
            })
          }
        >
          Email link to client
        </button>
        <button
          className="btn-ghost"
          disabled={pending || !active || !hasEmail}
          onClick={() =>
            start(async () => {
              const r = await sendReminderAction(id);
              setMsg(r.ok ? "Reminder sent." : "Reminder not sent.");
            })
          }
        >
          Send reminder now
        </button>
        </>
        )}
        <button
          className="btn-ghost"
          disabled={pending}
          onClick={() => confirm("Create a new link? The old link will stop working.") && start(() => regenerateLinkAction(id))}
        >
          New link
        </button>
        <button className="btn-ghost" disabled={pending} onClick={() => start(() => toggleLinkAction(id, !active))}>
          {active ? "Disable link" : "Enable link"}
        </button>
      </div>
      {msg && <p className="text-sm text-muted">{msg}</p>}
      {!emailEnabled && active && (
        <p className="text-sm text-muted">Paste the message into WhatsApp, a text, or GHL. The reminder lists exactly what&apos;s still missing.</p>
      )}
    </div>
  );
}

export function RevealPassword({ clientId, credId }: { clientId: number; credId: number }) {
  const [value, setValue] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (value !== null)
    return (
      <span className="inline-flex items-center gap-2">
        <code className="rounded bg-bg px-1.5 py-0.5 text-xs">{value}</code>
        <button className="text-xs text-brand hover:underline" onClick={() => navigator.clipboard.writeText(value)}>Copy</button>
        <button className="text-xs text-muted hover:underline" onClick={() => setValue(null)}>Hide</button>
      </span>
    );
  return (
    <button className="text-xs text-brand hover:underline" disabled={pending} onClick={() => start(async () => setValue(await revealPasswordAction(clientId, credId)))}>
      ••••••• Reveal
    </button>
  );
}

function suggestPassword() {
  const words = "amber,cedar,delta,ember,falcon,harbor,ivory,juniper,lunar,maple,nova,orbit,quartz,raven,summit,tango,velvet,willow".split(",");
  const pick = () => words[crypto.getRandomValues(new Uint32Array(1))[0] % words.length];
  return `${pick()}-${pick()}-${crypto.getRandomValues(new Uint32Array(1))[0] % 900 + 100}`;
}

export function CredentialsPdfForm({ clientId }: { clientId: number }) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  if (!open)
    return (
      <button className="btn-ghost w-full" onClick={() => (setPw(suggestPassword()), setOpen(true))}>
        Credentials PDF (protected)
      </button>
    );
  return (
    <form method="post" action={`/api/admin/clients/${clientId}/credentials-pdf`} className="space-y-2 rounded-lg border border-line p-3">
      <label className="label text-xs" htmlFor="pdf_password">Password to open the PDF</label>
      <input id="pdf_password" name="pdf_password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={8} className="input font-mono" />
      <p className="help">Send this password separately (call or chat), never in the same email as the PDF.</p>
      <div className="flex gap-2">
        <button className="btn-primary flex-1">Download</button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

export function DeleteClient({ id, company }: { id: number; company: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      className="btn-danger"
      disabled={pending}
      onClick={() => {
        if (prompt(`This deletes all data and files for this client. Type the company name to confirm:\n${company}`) === company)
          start(() => deleteClientAction(id));
      }}
    >
      Delete client
    </button>
  );
}
