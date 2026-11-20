"use client";

import { useState, useTransition } from "react";
import { lockAllAction, resolveRequestAction, setLockAction } from "../../actions";

export function SectionLock({ clientId, form, section, locked }: { clientId: number; form: string; section: string; locked: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => setLockAction(clientId, form, section, !locked))}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-medium transition ${
        locked ? "bg-text text-white hover:bg-text/85" : "text-muted ring-1 ring-line-strong hover:bg-sunken hover:text-text"
      }`}
      title={locked ? "Client can't edit this section. Click to unlock." : "Lock when your team starts working from these answers"}
    >
      <span aria-hidden>{locked ? "🔒" : "🔓"}</span>
      {locked ? "Locked" : "Lock"}
    </button>
  );
}

export function LockAll({ clientId, allLocked }: { clientId: number; allLocked: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className="btn-ghost" disabled={pending} onClick={() => start(() => lockAllAction(clientId, !allLocked))}>
      {allLocked ? "Unlock all sections" : "Lock all sections"}
    </button>
  );
}

export function RequestActions({ id }: { id: number }) {
  const [mode, setMode] = useState<"idle" | "decline">("idle");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  if (mode === "decline")
    return (
      <div className="mt-3 space-y-2">
        <label className="sr-only" htmlFor={`note-${id}`}>Reason</label>
        <input
          id={`note-${id}`}
          className="input"
          placeholder="Reason for the client (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="flex gap-2">
          <button className="btn-danger" disabled={pending} onClick={() => start(() => resolveRequestAction(id, false, note))}>
            Decline and email client
          </button>
          <button className="btn-ghost" onClick={() => setMode("idle")}>Cancel</button>
        </div>
      </div>
    );
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <button className="btn-primary" disabled={pending} onClick={() => start(() => resolveRequestAction(id, true, ""))}>
        Approve and unlock
      </button>
      <button className="btn-ghost" disabled={pending} onClick={() => setMode("decline")}>Decline</button>
    </div>
  );
}
