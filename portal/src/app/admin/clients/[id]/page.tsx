import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getAnswers, getClient, listCredentials, listFiles, markSeen, progress, recentActivity } from "@/lib/clients";
import { getBranding } from "@/lib/settings";
import { CopyButton } from "@/components/CopyButton";
import { formsForClient, FORMS, SERVICE_KEYS } from "@/lib/forms";
import { daysSince, fmtDate, formatAnswer, formatBytes } from "@/lib/format";
import { APP_URL, EMAIL_ENABLED, approvedMessage, inviteMessage, reminderMessage } from "@/lib/mail";
import { ProgressBar } from "@/components/StatusBadge";
import { CredentialsPdfForm, DeleteClient, LinkBox, RevealPassword, StatusSelect } from "./ClientControls";
import { updateClientAction } from "../../actions";
import { changedFieldMap, listChangeRequests, listLocks, sectionTitle } from "@/lib/locks";
import { LockAll, RequestActions, SectionLock } from "./LockControls";

export default async function ClientPage({ params }: PageProps<"/admin/clients/[id]">) {
  await connection();
  const { id: idStr } = await params;
  const client = getClient(Number(idStr));
  if (!client) notFound();
  const answers = getAnswers(client.id);
  const files = listFiles(client.id);
  const creds = listCredentials(client.id);
  const p = progress(client, answers, files, creds);
  const forms = formsForClient(client.services);
  const activity = recentActivity(client.id, 30);
  const locks = listLocks(client.id);
  const requests = listChangeRequests(client.id);
  const pendingReqs = requests.filter((r) => r.status === "pending");
  const changed = changedFieldMap(client.id, client.first_submitted_at);
  const totalSections = forms.reduce((n, f) => n + f.sections.length, 0);
  const allLocked = totalSections > 0 && locks.size >= totalSections;
  const link = `${APP_URL}/c/${client.token}`;
  const agency = getBranding().agencyName;
  const firstName = client.contact_name.split(" ")[0] ?? "";
  const missing = [...p.missingRequired, ...(p.credsPending.length ? [`Logins for: ${p.credsPending.join(", ")}`] : [])];
  const recentApproved = requests.filter(
    (r) => r.status === "approved" && daysSince(r.resolved_at) < 3,
  );
  markSeen(client.id);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm font-medium text-muted hover:text-text">All clients</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-extrabold">{client.company}</h1>
          <StatusSelect id={client.id} status={client.status} />
        </div>
        <p className="text-sm text-muted">
          {[client.contact_name, client.email].filter(Boolean).join(" · ")}
          {client.submitted_at && ` · Submitted ${fmtDate(client.submitted_at)}`}
          {client.version > 0 && ` · v${client.version}`}
        </p>
      </div>

      {pendingReqs.length > 0 && (
        <section className="rounded-2xl border-2 border-attn/50 bg-attn/5 p-5 sm:p-6">
          <h2 className="font-display text-lg font-bold">
            {pendingReqs.length} change request{pendingReqs.length === 1 ? "" : "s"} waiting for you
          </h2>
          <p className="text-sm text-muted">
            Approving unlocks that section so the client can make the change themselves.
            {EMAIL_ENABLED ? " They get an email either way." : " Then copy the message below and let them know."}
          </p>
          <ul className="mt-4 space-y-3">
            {pendingReqs.map((r) => (
              <li key={r.id} className="rounded-xl bg-surface p-4 ring-1 ring-line">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold">{sectionTitle(r.form_key, r.section_key)}</span>
                  <span className="text-sm text-faint">{fmtDate(r.created_at)}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-[15px]">&ldquo;{r.message}&rdquo;</p>
                <RequestActions id={r.id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {!EMAIL_ENABLED && recentApproved.length > 0 && (
        <section className="rounded-2xl border border-ok/30 bg-ok/5 p-5">
          <h2 className="font-display text-lg font-bold">Let the client know</h2>
          <p className="text-sm text-muted">You approved these change requests. Send the client a quick message so they know they can edit.</p>
          <ul className="mt-3 space-y-2">
            {recentApproved.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface px-4 py-3 ring-1 ring-line">
                <span className="text-[15px]">{sectionTitle(r.form_key, r.section_key)} is unlocked</span>
                <CopyButton text={approvedMessage(firstName, sectionTitle(r.form_key, r.section_key), link)} label="Copy message" />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <h2 className="mb-1 font-display text-lg font-bold">Client&apos;s private link</h2><p className="mb-4 text-sm text-muted">Anyone with this link can fill in and update this client&apos;s details.</p>
          <LinkBox
            id={client.id}
            link={link}
            active={!!client.link_active}
            hasEmail={!!client.email}
            emailEnabled={EMAIL_ENABLED}
            inviteText={inviteMessage(agency, firstName, link)}
            reminderText={reminderMessage(agency, firstName, link, p.percent, missing)}
          />
        </div>
        <div className="card space-y-3">
          <h2 className="font-display text-lg font-bold">Progress</h2>
          <ProgressBar percent={p.percent} wide />
          {p.missingRequired.length > 0 && (
            <p className="text-sm font-medium text-[#8a5d00]">Still needed: {p.missingRequired.join(", ")}</p>
          )}
          {p.credsPending.length > 0 && <p className="text-sm text-muted">{p.credsPending.length} login{p.credsPending.length === 1 ? "" : "s"} not added yet</p>}
          <div className="flex flex-col gap-2 pt-1">
            <p className="text-sm font-semibold">Download client details</p>
            <div className="grid grid-cols-2 gap-2">
              <a className="btn-primary" href={`/api/admin/clients/${client.id}/brief`}>PDF</a>
              <a className="btn-ghost" href={`/api/admin/export/excel?client=${client.id}`}>Excel</a>
            </div>
            <p className="text-xs text-muted">Both include every answer and file link, but no passwords.</p>
            <CredentialsPdfForm clientId={client.id} />
          </div>
        </div>
      </div>

      {forms.map((form) => (
        <section key={form.key} className="card">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-xl font-bold">{form.title}</h2>
            {form.key === forms[0].key && <LockAll clientId={client.id} allLocked={allLocked} />}
          </div>
          <div className="space-y-6">
            {form.sections.map((s) => (
              <div key={s.key}>
                <div className="mb-2.5 flex items-center justify-between gap-3">
                  <h3 className="font-display text-[15px] font-bold text-muted">{s.title}</h3>
                  <SectionLock clientId={client.id} form={form.key} section={s.key} locked={locks.has(`${form.key}.${s.key}`)} />
                </div>
                <dl className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                  {s.fields.map((f) => {
                    const fieldFiles = files.filter((x) => x.form_key === form.key && x.field_key === f.key);
                    const text = formatAnswer(f, answers[form.key]?.[f.key]);
                    const change = changed.get(`${form.key}.${f.key}`);
                    return (
                      <div key={f.key} className="grid gap-1 px-4 py-3 odd:bg-sunken/60 sm:grid-cols-3 sm:gap-4">
                        <dt className="text-[15px] text-muted">
                          {f.label}
                          {change && (
                            <span className="ml-2 inline-block rounded-md bg-attn/15 px-1.5 py-0.5 align-middle text-xs font-semibold text-[#8a5d00]">
                              Changed {fmtDate(change.at)}
                            </span>
                          )}
                        </dt>
                        <dd className="text-[15px] font-medium sm:col-span-2">
                          {f.type === "file" ? (
                            fieldFiles.length ? (
                              <ul className="space-y-1">
                                {fieldFiles.map((x) => (
                                  <li key={x.id}>
                                    <a className="text-brand hover:underline" href={`/api/files/${x.id}`} target="_blank">{x.original_name}</a>
                                    <span className="ml-2 text-xs text-muted">{formatBytes(x.size)}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <span className="text-muted/60">-</span>
                            )
                          ) : f.type === "colors" && Array.isArray(answers[form.key]?.[f.key]) ? (
                            <span className="flex flex-wrap gap-2">
                              {(answers[form.key][f.key] as string[]).map((c) => (
                                <span key={c} className="inline-flex items-center gap-1.5 text-xs">
                                  <span className="size-4 rounded border border-line" style={{ background: c }} />
                                  {c}
                                </span>
                              ))}
                            </span>
                          ) : text ? (
                            <span className="whitespace-pre-wrap">
                              {text}
                              {change && (
                                <span className="mt-1 block text-sm font-normal text-muted">
                                  Was: <s>{formatAnswer(f, change.from) || "(empty)"}</s>
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted/60">-</span>
                          )}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="card">
        <h2 className="mb-1 font-display text-xl font-bold">Logins & access</h2>
        <p className="mb-4 text-sm text-muted">Passwords are encrypted. Each time someone reveals one, it&apos;s added to the activity log.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-sm text-muted">
              <tr><th className="py-2 pr-4 font-medium">Platform</th><th className="py-2 pr-4 font-medium">Username</th><th className="py-2 pr-4 font-medium">Password</th><th className="py-2 font-medium">Notes</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {creds.map((c) => (
                <tr key={c.id}>
                  <td className="py-2 pr-4">
                    {c.platform}
                    {c.login_url && <div className="text-xs text-muted">{c.login_url}</div>}
                  </td>
                  {c.not_applicable ? (
                    <td colSpan={3} className="py-2 text-xs text-muted">Client doesn&apos;t have this</td>
                  ) : (
                    <>
                      <td className="py-2 pr-4">{c.username || <span className="text-muted/60">-</span>}</td>
                      <td className="py-2 pr-4">{c.has_password ? <RevealPassword clientId={client.id} credId={c.id} /> : <span className="text-muted/60">-</span>}</td>
                      <td className="py-2 text-xs text-muted">{c.notes}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-4 font-display text-lg font-bold">Client details</h2>
          <form action={updateClientAction.bind(null, client.id)} className="space-y-3">
            <input name="company" defaultValue={client.company} className="input" aria-label="Company" />
            <input name="contact_name" defaultValue={client.contact_name} placeholder="Contact person" className="input" aria-label="Contact" />
            <input name="email" type="email" defaultValue={client.email} placeholder="Email" className="input" aria-label="Email" />
            <div className="flex flex-wrap gap-4 text-sm">
              {SERVICE_KEYS.map((k) => (
                <label key={k} className="flex items-center gap-2">
                  <input type="checkbox" name="services" value={k} defaultChecked={client.services.includes(k)} className="accent-brand" />
                  {FORMS[k].title}
                </label>
              ))}
            </div>
            <div className="flex justify-between gap-2 pt-2">
              <DeleteClient id={client.id} company={client.company} />
              <button className="btn-ghost">Save details</button>
            </div>
          </form>
        </section>
        <section className="card">
          <h2 className="mb-4 font-display text-lg font-bold">Activity</h2>
          <ul className="max-h-72 space-y-2 overflow-y-auto text-sm">
            {activity.map((a, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-32 shrink-0 text-xs text-muted">{fmtDate(a.created_at)}</span>
                <span><span className="font-medium">{a.actor}</span> {a.action} {a.detail && <span className="text-muted">· {a.detail}</span>}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
