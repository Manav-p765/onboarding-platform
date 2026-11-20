"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnswerMap, Field, FormTemplate } from "@/lib/forms";
import { DEFAULT_PLATFORMS, isFilled } from "@/lib/forms";
import { formatBytes } from "@/lib/format";
import { removeCredentialAction, removeFileAction, requestChangeAction, saveAnswerAction, saveCredentialAction, submitAction } from "./actions";

type FileItem = { id: number; form_key: string; field_key: string; original_name: string; size: number };
type Cred = { id: number; platform: string; login_url: string; username: string; has_password: boolean; notes: string; not_applicable: boolean };
type SaveState = "idle" | "saving" | "saved" | "error";
type Req = { id: number; form_key: string; section_key: string; status: "pending" | "approved" | "declined"; message: string; admin_note: string };

type Props = {
  token: string;
  branding: { agencyName: string; logoUrl: string; supportEmail: string; supportPhone: string };
  client: { company: string; contact_name: string; status: string; submitted: boolean };
  forms: FormTemplate[];
  answers: AnswerMap;
  files: FileItem[];
  credentials: Cred[];
  locks: string[];
  requests: Req[];
};

export function ClientPortal(p: Props) {
  const [answers, setAnswers] = useState<AnswerMap>(p.answers);
  const [files, setFiles] = useState<FileItem[]>(p.files);
  const [creds, setCreds] = useState<Cred[]>(p.credentials);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [submitted, setSubmitted] = useState(p.client.submitted);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [requests, setRequests] = useState<Req[]>(p.requests);
  const locks = useMemo(() => new Set(p.locks), [p.locks]);
  const steps = useMemo(
    () => [...p.forms.map((f) => ({ key: f.key, title: f.title })), { key: "logins", title: "Logins & Access" }, { key: "review", title: "Review & Submit" }],
    [p.forms],
  );
  const [step, setStep] = useState(0);
  const timers = useRef(new Map<string, { t: ReturnType<typeof setTimeout>; run: () => Promise<void> }>());
  const pending = useRef(0);
  const topRef = useRef<HTMLDivElement>(null);

  /** Only say "Saved" when nothing is in flight AND nothing is waiting on a debounce timer. */
  const settle = useCallback(() => {
    if (pending.current === 0 && timers.current.size === 0) setSaveState("saved");
  }, []);

  const track = useCallback(async (fn: () => Promise<unknown>) => {
    pending.current++;
    setSaveState("saving");
    try {
      await fn();
      pending.current--;
      settle();
    } catch {
      pending.current--;
      setSaveState("error");
    }
  }, [settle]);

  const setAnswer = useCallback(
    (form: string, field: string, value: unknown, delay = 600) => {
      setAnswers((a) => ({ ...a, [form]: { ...a[form], [field]: value } }));
      const k = `${form}.${field}`;
      clearTimeout(timers.current.get(k)?.t);
      setSaveState("saving");
      const run = () => {
        timers.current.delete(k);
        return track(() => saveAnswerAction(p.token, form, field, value));
      };
      timers.current.set(k, { t: setTimeout(run, delay), run });
    },
    [p.token, track],
  );

  /** Save anything still waiting on its debounce timer (used before submit). */
  const flush = useCallback(async () => {
    const all = [...timers.current.values()];
    all.forEach((x) => clearTimeout(x.t));
    await Promise.all(all.map((x) => x.run()));
  }, []);

  // Warn before leaving while a save is still pending.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (timers.current.size || pending.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  const go = (i: number) => {
    setStep(i);
    topRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // ---- completion ----
  const fieldDone = (form: string, f: Field) =>
    f.type === "file" ? files.some((x) => x.form_key === form && x.field_key === f.key) : isFilled(answers[form]?.[f.key]);
  const stepStats = (key: string) => {
    if (key === "logins") {
      return { done: creds.filter((c) => c.not_applicable || c.username || c.has_password).length, total: creds.length };
    }
    const form = p.forms.find((f) => f.key === key);
    if (!form) return { done: 0, total: 0 };
    const fields = form.sections.flatMap((s) => s.fields);
    return { done: fields.filter((f) => fieldDone(form.key, f)).length, total: fields.length };
  };
  const totals = steps
    .filter((s) => s.key !== "review")
    .map((s) => stepStats(s.key))
    .reduce((a, b) => ({ done: a.done + b.done, total: a.total + b.total }), { done: 0, total: 0 });
  const percent = totals.total ? Math.round((totals.done / totals.total) * 100) : 0;
  const missingRequired = p.forms.flatMap((form) =>
    form.sections.flatMap((s) => s.fields.filter((f) => f.required && !fieldDone(form.key, f)).map((f) => ({ form, f }))),
  );

  const current = steps[step];
  const form = p.forms.find((f) => f.key === current.key);

  const firstName = p.client.contact_name ? p.client.contact_name.split(" ")[0] : "";
  const stepColors = steps.filter((s) => s.key !== "review").map((s) => ({ ...s, ...stepStats(s.key) }));

  return (
    <div className="min-h-screen" ref={topRef}>
      {/* Hero band: agency brand, greeting, and the checklist meter */}
      <header className="on-brand">
        <div className="mx-auto max-w-6xl px-4 pb-8 pt-5 sm:px-6 sm:pb-10">
          <div className="flex items-center gap-4">
            {p.branding.logoUrl ? (
              <span className="rounded-lg bg-white px-2.5 py-1.5 shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.branding.logoUrl} alt={p.branding.agencyName} className="h-7 w-auto" />
              </span>
            ) : (
              <span className="font-display text-lg font-bold">{p.branding.agencyName}</span>
            )}
            <div className="ml-auto"><SaveIndicator state={saveState} /></div>
          </div>

          <div className="mt-8 grid grid-cols-[minmax(0,1fr)] items-end gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div>
              <h1 className="font-display text-3xl font-extrabold leading-[1.1] sm:text-[2.6rem]">
                {firstName ? `${firstName}, let's get ${p.client.company} set up.` : `Let's get ${p.client.company} set up.`}
              </h1>
              <p className="mt-3 max-w-xl text-[17px] leading-relaxed text-white/85">
                Answer what you can. Everything saves as you type, so you can close this page and come back later with the same
                link. Anything you don&apos;t have yet can be skipped.
              </p>
            </div>

            <div className="rounded-2xl bg-black/20 p-4 ring-1 ring-white/15 backdrop-blur-sm">
              <div className="flex items-baseline justify-between">
                <span className="font-display text-4xl font-extrabold tabular-nums">{percent}%</span>
                <span className="text-sm text-white/80">{totals.done} of {totals.total} items done</span>
              </div>
              <div className="mt-3 flex gap-1.5" aria-hidden>
                {stepColors.map((s) => (
                  <div key={s.key} className="h-2.5 overflow-hidden rounded-full bg-white/20" style={{ flex: Math.max(s.total, 1) }}>
                    <div className="h-full rounded-full bg-white transition-[width] duration-500" style={{ width: `${s.total ? (s.done / s.total) * 100 : 0}%` }} />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-1.5 text-[11px] text-white/70" aria-hidden>
                {stepColors.map((s) => (
                  <span key={s.key} className="truncate" style={{ flex: Math.max(s.total, 1) }}>{s.title}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
          <nav aria-label="Steps" className="min-w-0 lg:sticky lg:top-6 lg:self-start">
            <ol className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0">
              {steps.map((s, i) => {
                const st = s.key === "review" ? null : stepStats(s.key);
                const complete = !!st && st.total > 0 && st.done === st.total;
                const active = i === step;
                return (
                  <li key={s.key} className="shrink-0">
                    <button
                      onClick={() => go(i)}
                      aria-current={active ? "step" : undefined}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] transition ${
                        active ? "bg-surface font-semibold text-text shadow-sm ring-1 ring-line" : "text-muted hover:bg-surface/70 hover:text-text"
                      }`}
                    >
                      <span
                        className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${
                          complete ? "bg-ok text-white" : active ? "bg-brand text-white" : "border-2 border-line-strong text-muted"
                        }`}
                      >
                        {complete ? "✓" : i + 1}
                      </span>
                      <span className="whitespace-nowrap">{s.title}</span>
                      {st && st.total > 0 && !complete && (
                        <span className="ml-auto hidden text-[13px] tabular-nums text-faint lg:inline">{st.done}/{st.total}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>
            {(p.branding.supportEmail || p.branding.supportPhone) && (
              <div className="mt-6 hidden rounded-xl border border-line bg-surface/60 p-4 text-sm text-muted lg:block">
                <p className="font-semibold text-text">Stuck on something?</p>
                <p className="mt-1">Reach {p.branding.agencyName}:</p>
                {p.branding.supportPhone && <p className="mt-1 font-medium text-text">{p.branding.supportPhone}</p>}
                {p.branding.supportEmail && <p className="break-all font-medium text-text">{p.branding.supportEmail}</p>}
              </div>
            )}
          </nav>

          <main className="min-w-0">
            {form && (
              <FormStep
                form={form}
                stepNo={step + 1}
                answers={answers[form.key] ?? {}}
                files={files.filter((f) => f.form_key === form.key)}
                token={p.token}
                isDone={(f) => fieldDone(form.key, f)}
                locks={locks}
                requests={requests.filter((r) => r.form_key === form.key)}
                onRequestChange={async (section, message) => {
                  const res = await requestChangeAction(p.token, form.key, section, message);
                  if (res.ok)
                    setRequests((r) => [{ id: Date.now(), form_key: form.key, section_key: section, status: "pending", message, admin_note: "" }, ...r]);
                  return res;
                }}
                onChange={(field, v, delay) => setAnswer(form.key, field, v, delay)}
                onFileAdded={(f) => (setFiles((x) => [...x, f]), settle())}
                onFileRemoved={(id) => {
                  setFiles((x) => x.filter((f) => f.id !== id));
                  track(() => removeFileAction(p.token, id));
                }}
              />
            )}
            {current.key === "logins" && <LoginsStep stepNo={step + 1} token={p.token} creds={creds} setCreds={setCreds} track={track} />}
            {current.key === "review" && (
              <ReviewStep
                percent={percent}
                missing={missingRequired.map(({ form, f }) => ({ label: f.label, formTitle: form.title, stepIndex: steps.findIndex((s) => s.key === form.key) }))}
                credsPending={creds.filter((c) => !c.not_applicable && !c.username && !c.has_password).map((c) => c.platform)}
                submitted={submitted}
                justSubmitted={justSubmitted}
                go={go}
                branding={p.branding}
                onSubmit={async () => {
                  await flush();
                  await track(() => submitAction(p.token));
                  setSubmitted(true);
                  setJustSubmitted(true);
                }}
              />
            )}

            {current.key !== "review" && (
              <div className="mt-8 flex items-center justify-between gap-3 border-t border-line pt-6">
                <button className="btn-ghost" disabled={step === 0} onClick={() => go(step - 1)}>Back</button>
                <button className="btn-primary" onClick={() => go(step + 1)}>Continue to {steps[step + 1]?.title}</button>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}


function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  const map = {
    saving: ["Saving…", "bg-white/15 text-white"],
    saved: ["✓ Saved", "bg-white/15 text-white"],
    error: ["Not saved. Check your connection", "bg-white text-danger"],
  } as const;
  const [t, c] = map[state];
  return <span className={`rounded-full px-3 py-1 text-sm font-medium ${c}`} role="status">{t}</span>;
}

// ---------------- form step ----------------

function StepHeading({ stepNo, title, description }: { stepNo: number; title: string; description: string }) {
  return (
    <div className="mb-6">
      <p className="text-sm font-semibold text-brand">{stepNo ? `Step ${stepNo}` : "Last step"}</p>
      <h2 className="mt-0.5 font-display text-2xl font-bold sm:text-[1.75rem]">{title}</h2>
      <p className="mt-1.5 max-w-2xl text-[16px] text-muted">{description}</p>
    </div>
  );
}

function FormStep(props: {
  form: FormTemplate;
  stepNo: number;
  answers: Record<string, unknown>;
  files: FileItem[];
  token: string;
  isDone: (f: Field) => boolean;
  locks: Set<string>;
  requests: Req[];
  onRequestChange: (section: string, message: string) => Promise<{ ok: boolean; error?: string }>;
  onChange: (field: string, v: unknown, delay?: number) => void;
  onFileAdded: (f: FileItem) => void;
  onFileRemoved: (id: number) => void;
}) {
  const { form } = props;
  return (
    <div>
      <StepHeading stepNo={props.stepNo} title={form.title} description={form.description} />
      <div className="space-y-5">
        {form.sections.map((s) => {
          const done = s.fields.filter(props.isDone).length;
          const locked = props.locks.has(`${form.key}.${s.key}`);
          const sectionReqs = props.requests.filter((r) => r.section_key === s.key);
          return (
            // Ledger layout: section context on the left, questions on the right.
            <section key={s.key} className="card grid gap-6 md:grid-cols-[200px_1fr] md:gap-10">
              <div>
                <h3 className="font-display text-lg font-bold">{s.title}</h3>
                {s.description && <p className="mt-1 text-sm text-muted">{s.description}</p>}
                <p className={`mt-3 text-sm font-medium ${done === s.fields.length ? "text-ok" : "text-faint"}`}>
                  {done === s.fields.length ? "✓ Section complete" : `${done} of ${s.fields.length} answered`}
                </p>
              </div>
              <div className="space-y-6">
                {locked && <LockedBanner requests={sectionReqs} onRequest={(m) => props.onRequestChange(s.key, m)} />}
                {!locked && sectionReqs[0]?.status === "approved" && (
                  <p className="rounded-xl border border-ok/30 bg-ok/5 px-4 py-3 text-[15px]">
                    Your change request was approved. Update the answers below; they save automatically.
                  </p>
                )}
                <fieldset disabled={locked} className={`space-y-6 ${locked ? "opacity-75" : ""}`}>
                {s.fields.map((f) => (
                  <FieldInput
                    key={f.key}
                    id={`${form.key}-${f.key}`}
                    field={f}
                    done={props.isDone(f)}
                    value={props.answers[f.key]}
                    onChange={(v, d) => props.onChange(f.key, v, d)}
                    files={props.files.filter((x) => x.field_key === f.key)}
                    upload={{ token: props.token, form: form.key }}
                    onFileAdded={props.onFileAdded}
                    onFileRemoved={props.onFileRemoved}
                    locked={locked}
                  />
                ))}
                </fieldset>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function LockedBanner({ requests, onRequest }: { requests: Req[]; onRequest: (message: string) => Promise<{ ok: boolean; error?: string }> }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = requests.find((r) => r.status === "pending");
  const declined = requests[0]?.status === "declined" ? requests[0] : null;
  return (
    <div className="rounded-xl border border-line-strong bg-sunken p-4">
      <p className="flex items-center gap-2 font-semibold">
        <span aria-hidden>🔒</span> Our team is working from these answers
      </p>
      <p className="mt-1 text-[15px] text-muted">
        To keep the project on track, this section can&apos;t be edited right now. If something has changed, tell us and we&apos;ll
        open it back up for you.
      </p>
      {pending ? (
        <p className="mt-3 rounded-lg bg-white px-3 py-2 text-[15px] ring-1 ring-line">
          <span className="font-semibold">Change requested.</span> We&apos;ll get back to you shortly.
          <span className="mt-1 block text-muted">&ldquo;{pending.message}&rdquo;</span>
        </p>
      ) : open ? (
        <div className="mt-3 space-y-2">
          <label className="sr-only" htmlFor="cr-msg">What needs to change?</label>
          <textarea id="cr-msg" rows={3} className="input" placeholder="What needs to change, and why?" value={msg} onChange={(e) => setMsg(e.target.value)} />
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-primary"
              disabled={busy || !msg.trim()}
              onClick={async () => {
                setBusy(true);
                const r = await onRequest(msg.trim());
                setBusy(false);
                if (r.ok) setOpen(false);
                else setError(r.error ?? "Not sent. Try again.");
              }}
            >
              {busy ? "Sending…" : "Send request"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <>
          {declined && (
            <p className="mt-3 text-[15px] text-muted">
              Your last request wasn&apos;t approved{declined.admin_note ? `: ${declined.admin_note}` : "."}
            </p>
          )}
          <button type="button" className="btn-ghost mt-3" onClick={() => setOpen(true)}>Request a change</button>
        </>
      )}
    </div>
  );
}

function FieldInput({
  id,
  field: f,
  done,
  value,
  onChange,
  files,
  upload,
  onFileAdded,
  onFileRemoved,
  locked,
}: {
  locked?: boolean;
  id: string;
  field: Field;
  done: boolean;
  value: unknown;
  onChange: (v: unknown, delay?: number) => void;
  files: FileItem[];
  upload: { token: string; form: string };
  onFileAdded: (f: FileItem) => void;
  onFileRemoved: (id: number) => void;
}) {
  const tick = done ? (
    <span className="flex size-5 items-center justify-center rounded-full bg-ok text-[11px] text-white" aria-label="answered">✓</span>
  ) : f.required ? (
    <span className="rounded-md bg-attn/12 px-1.5 py-0.5 text-xs font-semibold text-attn">Needed</span>
  ) : null;
  const label = (
    <label className="label" htmlFor={id}>
      {f.label}
      {tick}
    </label>
  );
  const groupLabel = (lid: string) => (
    <span id={lid} className="label">
      {f.label}
      {tick}
    </span>
  );
  const help = f.help && <p className="help">{f.help}</p>;
  const str = typeof value === "string" ? value : "";

  switch (f.type) {
    case "textarea":
      return (
        <div>
          {label}
          <textarea id={id} rows={3} className="input resize-y" placeholder={f.placeholder} value={str} onChange={(e) => onChange(e.target.value)} />
          {help}
        </div>
      );
    case "select":
      return (
        <div role="radiogroup" aria-labelledby={`${id}-l`}>
          {groupLabel(`${id}-l`)}
          <div className="flex flex-wrap gap-2">
            {f.options!.map((o) => (
              <button
                type="button"
                key={o}
                role="radio"
                aria-checked={str === o}
                onClick={() => onChange(str === o ? "" : o, 0)}
                className={`chip ${str === o ? "border-brand bg-brand text-white" : "border-line-strong bg-white hover:border-brand"}`}
              >
                {o}
              </button>
            ))}
          </div>
          {help}
        </div>
      );
    case "checkboxes": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <fieldset>
          <legend className="label">{f.label}{tick}</legend>
          <div className="flex flex-wrap gap-2">
            {f.options!.map((o) => {
              const on = arr.includes(o);
              return (
                <button
                  type="button"
                  key={o}
                  aria-pressed={on}
                  onClick={() => onChange(on ? arr.filter((x) => x !== o) : [...arr, o], 0)}
                  className={`chip ${on ? "border-brand bg-brand/10 font-semibold text-brand" : "border-line-strong bg-white hover:border-brand"}`}
                >
                  {on ? "✓ " : ""}
                  {o}
                </button>
              );
            })}
          </div>
          {help}
        </fieldset>
      );
    }
    case "colors": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div>
          {groupLabel(`${id}-l`)}
          <div className="flex flex-wrap items-center gap-2">
            {arr.map((c, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-lg border border-line bg-white p-1 pr-2">
                <input
                  type="color"
                  value={c}
                  onChange={(e) => onChange(arr.map((x, j) => (j === i ? e.target.value : x)))}
                  className="size-7 cursor-pointer rounded"
                  aria-label={`Color ${i + 1}`}
                />
                <span className="font-mono text-xs">{c}</span>
                <button type="button" className="ml-1 text-muted hover:text-danger" aria-label="Remove color" onClick={() => onChange(arr.filter((_, j) => j !== i), 0)}>×</button>
              </span>
            ))}
            {arr.length < 12 && (
              <button type="button" className="btn-ghost py-1.5" onClick={() => onChange([...arr, "#1e40af"], 0)}>+ Add color</button>
            )}
          </div>
          {help}
        </div>
      );
    }
    case "repeater": {
      const rows = Array.isArray(value) && value.length ? (value as Record<string, string>[]) : [{}];
      const max = f.maxRows ?? 20;
      const set = (i: number, k: string, v: string) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
      return (
        <div>
          {groupLabel(`${id}-l`)}
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="flex gap-2">
                {f.columns!.map((c) => (
                  <input
                    key={c.key}
                    className="input"
                    placeholder={c.placeholder ?? c.label}
                    aria-label={`${c.label} ${i + 1}`}
                    value={r[c.key] ?? ""}
                    onChange={(e) => set(i, c.key, e.target.value)}
                  />
                ))}
                {rows.length > 1 && (
                  <button type="button" className="px-2 text-muted hover:text-danger" aria-label="Remove row" onClick={() => onChange(rows.filter((_, j) => j !== i), 0)}>×</button>
                )}
              </div>
            ))}
          </div>
          {rows.length < max && (
            <button type="button" className="mt-2 text-sm text-brand hover:underline" onClick={() => onChange([...rows, {}], 0)}>+ Add another</button>
          )}
          {help}
        </div>
      );
    }
    case "file":
      return (
        <div>
          {groupLabel(`${id}-l`)}
          <FileDrop
            field={f}
            files={files}
            onUploaded={onFileAdded}
            onRemove={onFileRemoved}
            uploadUrl={(name) =>
              `/api/upload?token=${encodeURIComponent(upload.token)}&form=${upload.form}&field=${f.key}&name=${encodeURIComponent(name)}`
            }
            token={upload.token}
            locked={locked}
          />
          {help}
        </div>
      );
    default:
      return (
        <div>
          {label}
          <input
            id={id}
            type={f.type === "url" ? "text" : f.type}
            inputMode={f.type === "url" ? "url" : undefined}
            className="input"
            placeholder={f.placeholder}
            value={str}
            onChange={(e) => onChange(e.target.value)}
            autoComplete={f.type === "email" ? "email" : f.type === "tel" ? "tel" : undefined}
          />
          {help}
        </div>
      );
  }
}

function FileDrop({
  field,
  files,
  onUploaded,
  onRemove,
  uploadUrl,
  token,
  locked,
}: {
  locked?: boolean;
  field: Field;
  files: FileItem[];
  onUploaded: (f: FileItem) => void;
  onRemove: (id: number) => void;
  uploadUrl: (name: string) => string;
  token: string;
}) {
  const [uploads, setUploads] = useState<{ name: string; pct: number; error?: string }[]>([]);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const send = (file: File) =>
    new Promise<void>((resolve) => {
      if (file.size > 200 * 1024 * 1024) {
        setUploads((u) => [...u, { name: file.name, pct: 0, error: "Over 200 MB. Please share a Drive/Dropbox link instead." }]);
        return resolve();
      }
      const xhr = new XMLHttpRequest();
      xhr.open("POST", uploadUrl(file.name));
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      setUploads((u) => [...u, { name: file.name, pct: 0 }]);
      const update = (patch: Partial<{ pct: number; error: string }>) =>
        setUploads((u) => u.map((x) => (x.name === file.name ? { ...x, ...patch } : x)));
      xhr.upload.onprogress = (e) => e.lengthComputable && update({ pct: Math.round((e.loaded / e.total) * 100) });
      xhr.onload = () => {
        if (xhr.status === 200) {
          onUploaded(JSON.parse(xhr.responseText));
          setUploads((u) => u.filter((x) => x.name !== file.name));
        } else {
          let msg = "Upload failed";
          try {
            msg = JSON.parse(xhr.responseText).error ?? msg;
          } catch {}
          update({ error: msg });
        }
        resolve();
      };
      xhr.onerror = () => (update({ error: "Upload failed, check your connection" }), resolve());
      xhr.send(file);
    });

  const handle = async (list: FileList | null) => {
    if (!list) return;
    for (const f of Array.from(list)) await send(f);
  };

  return (
    <div>
      {!locked && (
      <div
        onDragOver={(e) => (e.preventDefault(), setDrag(true))}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          handle(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-7 text-center transition ${
          drag ? "border-brand bg-brand/5" : "border-line-strong bg-sunken hover:border-brand hover:bg-brand/5"
        }`}
      >
        <span className="text-[15px] font-semibold text-text">Drag files here, or <span className="text-brand underline underline-offset-2">choose from your device</span></span>
        <span className="mt-1 text-sm text-muted">Up to 200 MB each</span>
        <input ref={inputRef} type="file" hidden multiple={field.multiple} accept={field.accept} onChange={(e) => (handle(e.target.files), (e.target.value = ""))} />
      </div>
      )}
      {locked && files.length === 0 && <p className="text-[15px] text-faint">No files</p>}
      {(files.length > 0 || uploads.length > 0) && (
        <ul className="mt-2 space-y-1.5">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm">
              <span className="text-ok">✓</span>
              <a href={`/api/files/${f.id}?t=${encodeURIComponent(token)}`} target="_blank" className="truncate hover:text-brand">{f.original_name}</a>
              <span className="text-xs text-muted">{formatBytes(f.size)}</span>
              <button type="button" className="ml-auto text-muted hover:text-danger" aria-label={`Remove ${f.original_name}`} onClick={() => onRemove(f.id)}>×</button>
            </li>
          ))}
          {uploads.map((u) => (
            <li key={u.name} className="rounded-lg border border-line bg-white px-3 py-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="truncate">{u.name}</span>
                {u.error ? (
                  <button type="button" className="text-xs text-muted" onClick={() => setUploads((x) => x.filter((y) => y.name !== u.name))}>Dismiss</button>
                ) : (
                  <span className="text-xs text-muted">{u.pct}%</span>
                )}
              </div>
              {u.error ? (
                <p className="mt-1 text-xs text-danger">{u.error}</p>
              ) : (
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line"><div className="h-full bg-brand" style={{ width: `${u.pct}%` }} /></div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------- logins ----------------

function LoginsStep({
  stepNo,
  token,
  creds,
  setCreds,
  track,
}: {
  stepNo: number;
  token: string;
  creds: Cred[];
  setCreds: (c: Cred[]) => void;
  track: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [newPlatform, setNewPlatform] = useState("");
  const save = (data: Parameters<typeof saveCredentialAction>[1]) => track(async () => setCreds(await saveCredentialAction(token, data)));

  return (
    <div>
      <StepHeading
        stepNo={stepNo}
        title="Logins & Access"
        description="Add the logins we'll need to work on your accounts. If you don't have one of these accounts, tick “I don't have this” and move on."
      />
      <div className="mb-5 flex gap-3 rounded-2xl border border-ok/25 bg-ok/5 p-4 text-[15px]">
        <span aria-hidden className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-ok text-xs text-white">🔒</span>
        <p className="text-text">
          Passwords are encrypted as soon as you save them. Only the account manager can view them, and every view is recorded.
          Once saved, they&apos;re hidden from this page too.
        </p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {creds.map((c) => (
          <CredCard key={c.id} c={c} onSave={save} onRemove={() => track(async () => setCreds(await removeCredentialAction(token, c.id)))} />
        ))}
      </div>
      <div className="card mt-4">
        <label className="label" htmlFor="new-platform">Another account we should have?</label>
        <div className="flex gap-2">
          <input id="new-platform" className="input" placeholder="e.g. YouTube, Yelp, email provider" value={newPlatform} onChange={(e) => setNewPlatform(e.target.value)} />
          <button
            className="btn-ghost shrink-0"
            disabled={!newPlatform.trim()}
            onClick={() => {
              save({ platform: newPlatform.trim(), username: "" });
              setNewPlatform("");
            }}
          >
            Add account
          </button>
        </div>
      </div>
    </div>
  );
}

function CredCard({ c, onSave, onRemove }: { c: Cred; onSave: (d: Parameters<typeof saveCredentialAction>[1]) => void; onRemove: () => void }) {
  const [username, setUsername] = useState(c.username);
  const [password, setPassword] = useState("");
  const [notes, setNotes] = useState(c.notes);
  const [show, setShow] = useState(false);
  // optimistic: the tick box reacts instantly; the server saves in the background
  const [na, setNa] = useState(c.not_applicable);
  const provided = !na && (c.username || c.has_password);
  const base = `cred-${c.id}`;
  return (
    <section
      className={`rounded-2xl border bg-surface p-5 transition ${
        na ? "border-dashed border-line-strong bg-sunken" : provided ? "border-ok/40" : "border-line"
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className={`font-display text-[17px] font-bold ${na ? "text-muted" : ""}`}>{c.platform}</h3>
        {provided && <span className="badge bg-ok/10 text-ok">✓ Saved</span>}
        {!DEFAULT_PLATFORMS.includes(c.platform) && (
          <button className="text-sm text-muted underline-offset-2 hover:text-danger hover:underline" onClick={onRemove}>Remove</button>
        )}
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            className="size-4 accent-brand"
            checked={na}
            onChange={(e) => {
              setNa(e.target.checked);
              onSave({ platform: c.platform, not_applicable: e.target.checked });
            }}
          />
          I don&apos;t have this
        </label>
      </div>
      {!na && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-muted" htmlFor={`${base}-u`}>Username or email</label>
            <input id={`${base}-u`} className="input" autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)}
              onBlur={() => username !== c.username && onSave({ platform: c.platform, username })} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-muted" htmlFor={`${base}-p`}>Password</label>
            <div className="relative">
              <input id={`${base}-p`} className="input pr-16" type={show ? "text" : "password"} autoComplete="new-password"
                placeholder={c.has_password ? "Saved. Type to replace" : ""} value={password} onChange={(e) => setPassword(e.target.value)}
                onBlur={() => {
                  if (password) {
                    onSave({ platform: c.platform, password });
                    setPassword("");
                    setShow(false);
                  }
                }} />
              <button type="button" className="absolute inset-y-1 right-1 rounded-lg px-3 text-sm font-medium text-muted hover:bg-sunken hover:text-text" onClick={() => setShow((s) => !s)}>
                {show ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-muted" htmlFor={`${base}-n`}>Notes (optional)</label>
            <input id={`${base}-n`} className="input" placeholder="e.g. the login code goes to my phone, call me first" value={notes} onChange={(e) => setNotes(e.target.value)}
              onBlur={() => notes !== c.notes && onSave({ platform: c.platform, notes })} />
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------- review ----------------

function ReviewStep(props: {
  percent: number;
  missing: { label: string; formTitle: string; stepIndex: number }[];
  credsPending: string[];
  submitted: boolean;
  justSubmitted: boolean;
  go: (i: number) => void;
  branding: Props["branding"];
  onSubmit: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  if (props.justSubmitted)
    return (
      <div className="card py-12 text-center">
        <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-ok text-3xl text-white shadow-[0_0_0_8px_rgba(31,122,77,0.12)]">✓</div>
        <h2 className="font-display text-2xl font-bold">Sent. Thank you!</h2>
        <p className="mx-auto mt-2 max-w-md text-[16px] text-muted">
          {props.branding.agencyName} has your details and will be in touch. If anything changes, come back to this same link,
          update it, and send again.
        </p>
      </div>
    );
  const allGood = props.missing.length === 0 && props.credsPending.length === 0;
  return (
    <div>
      <StepHeading
        stepNo={0}
        title="Review & send"
        description={
          allGood
            ? "Everything is filled in. Send it over and we'll get started."
            : `You're ${props.percent}% done. You can send now and fill in the rest later.`
        }
      />
      <div className="space-y-4">
        {props.missing.length > 0 && (
          <div className="rounded-2xl border border-attn/40 bg-attn/5 p-5">
            <h3 className="font-display text-lg font-bold">Still needed</h3>
            <ul className="mt-3 divide-y divide-attn/20">
              {props.missing.map((m) => (
                <li key={m.formTitle + m.label}>
                  <button className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-[15px] hover:text-brand" onClick={() => props.go(m.stepIndex)}>
                    <span><span className="text-muted">{m.formTitle}:</span> {m.label}</span>
                    <span className="shrink-0 text-sm font-semibold text-brand">Fill in</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {props.credsPending.length > 0 && (
          <div className="card">
            <h3 className="font-display text-lg font-bold">Logins not added yet</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {props.credsPending.map((c) => <span key={c} className="badge bg-sunken text-muted ring-1 ring-line">{c}</span>)}
            </div>
          </div>
        )}
        <div className="card flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-md text-[15px] text-muted">
            {props.submitted
              ? "You've sent this before. Sending again tells the team you've made changes."
              : `${props.branding.agencyName} sees it the moment you send.`}
          </p>
          <button
            className="btn-primary w-full px-8 sm:w-auto"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await props.onSubmit();
              setBusy(false);
            }}
          >
            {busy ? "Sending…" : props.submitted ? "Send changes" : "Send to the team"}
          </button>
        </div>
      </div>
    </div>
  );
}
