"use client";

import { useState } from "react";

/** Copies a ready-made message to paste into WhatsApp, SMS, GHL, etc. */
export function CopyButton({ text, label, className = "btn-ghost", onCopied }: { text: string; label: string; className?: string; onCopied?: () => void }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        onCopied?.();
        setTimeout(() => setDone(false), 1800);
      }}
    >
      {done ? "Copied ✓" : label}
    </button>
  );
}
