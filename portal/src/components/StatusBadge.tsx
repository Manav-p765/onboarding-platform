import type { ClientStatus } from "@/lib/clients";

const STYLE: Record<ClientStatus, [string, string]> = {
  not_started: ["Not opened", "bg-sunken text-muted ring-1 ring-line"],
  in_progress: ["Filling in", "bg-attn/12 text-[#8a5d00] ring-1 ring-attn/30"],
  submitted: ["Ready to review", "bg-brand/10 text-brand ring-1 ring-brand/25"],
  in_work: ["In work", "bg-violet-50 text-violet-800 ring-1 ring-violet-200"],
  complete: ["Complete", "bg-ok/10 text-ok ring-1 ring-ok/25"],
};

export const STATUS_TEXT = Object.fromEntries(Object.entries(STYLE).map(([k, v]) => [k, v[0]])) as Record<ClientStatus, string>;

export function StatusBadge({ status }: { status: ClientStatus }) {
  const [label, cls] = STYLE[status];
  return <span className={`badge ${cls}`}>{label}</span>;
}

export function ProgressBar({ percent, wide }: { percent: number; wide?: boolean }) {
  const color = percent >= 100 ? "bg-ok" : "bg-brand";
  return (
    <div className="flex items-center gap-3">
      <div className={`h-2 w-full overflow-hidden rounded-full bg-line ${wide ? "" : "min-w-20"}`}>
        <div className={`h-full rounded-full ${color}`} style={{ width: `${percent}%` }} />
      </div>
      <span className="w-10 text-right text-sm font-semibold tabular-nums">{percent}%</span>
    </div>
  );
}

export function Initials({ name }: { name: string }) {
  const letters = name
    .replace(/[^A-Za-z0-9 ]/g, "")
    .split(/\s+/)
    .filter((w) => w && !/^(llc|inc|the|of|and)$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 font-display text-sm font-extrabold text-brand">
      {letters || "?"}
    </span>
  );
}
