import Link from "next/link";
import { connection } from "next/server";
import { hasNewActivity, listClients, progress, type ClientStatus } from "@/lib/clients";
import { FORMS } from "@/lib/forms";
import { daysSince, fmtDate } from "@/lib/format";
import { Initials, ProgressBar, StatusBadge } from "@/components/StatusBadge";
import { pendingRequestCounts } from "@/lib/locks";

const SUMMARY: { status: ClientStatus[]; label: string; hint: string }[] = [
  { status: ["not_started", "in_progress"], label: "Waiting on client", hint: "Link sent, still filling in" },
  { status: ["submitted"], label: "Ready to review", hint: "Client has sent their details" },
  { status: ["in_work"], label: "In work", hint: "Team is building" },
  { status: ["complete"], label: "Complete", hint: "Onboarding finished" },
];

export default async function Dashboard() {
  await connection();
  const reqCounts = pendingRequestCounts();
  const clients = listClients().map((c) => ({ c, p: progress(c), reqs: reqCounts.get(c.id) ?? 0, fresh: hasNewActivity(c) }));

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold">Clients</h1>
          <p className="mt-1 text-muted">Everyone you&apos;re onboarding, and what each one still owes you.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {clients.length > 0 && (
            <a href="/api/admin/export/excel" className="btn-ghost">Export all to Excel</a>
          )}
          <Link href="/admin/clients/new" className="btn-primary">New client</Link>
        </div>
      </div>

      {clients.length > 0 && (
        <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {SUMMARY.map((s) => {
            const n = clients.filter(({ c }) => s.status.includes(c.status)).length;
            const highlight = s.label === "Ready to review" && n > 0;
            return (
              <div key={s.label} className={`rounded-2xl border p-4 ${highlight ? "border-brand bg-brand text-white" : "border-line bg-surface"}`}>
                <div className="font-display text-3xl font-extrabold tabular-nums">{n}</div>
                <div className="mt-1 font-semibold">{s.label}</div>
                <div className={`text-sm ${highlight ? "text-white/80" : "text-muted"}`}>{s.hint}</div>
              </div>
            );
          })}
        </div>
      )}

      {clients.length === 0 ? (
        <div className="card flex flex-col items-center py-14 text-center">
          <h2 className="font-display text-xl font-bold">Add your first client</h2>
          <p className="mt-2 max-w-sm text-muted">
            You&apos;ll get a private link to send them. Their answers, files and logins land here as they fill it in.
          </p>
          <Link href="/admin/clients/new" className="btn-primary mt-6">New client</Link>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
          {clients.map(({ c, p, reqs, fresh }) => {
            const nudge = (c.status === "not_started" || c.status === "in_progress") && daysSince(c.updated_at) >= 3;
            const owed = p.missingRequired.length + p.credsPending.length;
            return (
              <li key={c.id} className="border-b border-line last:border-0">
                <Link href={`/admin/clients/${c.id}`} className="grid items-center gap-4 px-5 py-4 transition hover:bg-sunken md:grid-cols-[minmax(0,1fr)_150px_200px_210px]">
                  <div className="flex min-w-0 items-center gap-3.5">
                    <Initials name={c.company} />
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{c.company}</div>
                      <div className="truncate text-sm text-muted">
                        {[c.contact_name, c.services.map((s) => FORMS[s]?.short).join(" + ")].filter(Boolean).join(", ")}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <StatusBadge status={c.status} />
                    {reqs > 0 && <span className="badge bg-attn text-white">{reqs} change request{reqs === 1 ? "" : "s"}</span>}
                    {fresh && <span className="badge bg-brand text-white">New activity</span>}
                    {nudge && <span className="badge bg-sunken text-muted ring-1 ring-line">Quiet {Math.floor(daysSince(c.updated_at))} days: send a reminder</span>}
                  </div>
                  <ProgressBar percent={p.percent} />
                  <div className="text-sm md:text-right">
                    {owed > 0 ? (
                      <span className="font-medium text-[#8a5d00]">{owed} item{owed === 1 ? "" : "s"} outstanding</span>
                    ) : (
                      <span className="font-medium text-ok">Nothing outstanding</span>
                    )}
                    <div className="whitespace-nowrap text-faint">Updated {fmtDate(c.updated_at)}</div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
