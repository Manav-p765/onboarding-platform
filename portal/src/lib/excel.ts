import "server-only";
import ExcelJS from "exceljs";
import { getAnswers, listCredentials, listFiles, progress, STATUS_LABEL, type Client } from "./clients";
import { FORMS, formsForClient, type FormTemplate } from "./forms";
import { fmtDate, formatAnswer } from "./format";
import { getBranding } from "./settings";
import { APP_URL } from "./mail";

/**
 * Excel export of everything clients entered. One overview sheet, one sheet per service form
 * (one row per client), and a logins status sheet. Passwords are never included.
 */
export async function buildWorkbook(clients: Client[]): Promise<Buffer> {
  const b = getBranding();
  const brand = (b.primaryColor.replace("#", "").toUpperCase() || "0B4A8B").padEnd(6, "0").slice(0, 6);
  const wb = new ExcelJS.Workbook();
  wb.creator = b.agencyName;
  wb.created = new Date();

  const styleHeader = (ws: ExcelJS.Worksheet) => {
    const row = ws.getRow(1);
    row.font = { bold: true, color: { argb: "FFFFFFFF" } };
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${brand}` } };
    row.alignment = { vertical: "middle", wrapText: true };
    row.height = 30;
    ws.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
  };
  const wrapBody = (ws: ExcelJS.Worksheet) =>
    ws.eachRow((r, i) => {
      if (i > 1) r.alignment = { vertical: "top", wrapText: true };
    });

  const data = clients.map((c) => {
    const answers = getAnswers(c.id);
    const files = listFiles(c.id);
    const creds = listCredentials(c.id);
    return { c, answers, files, creds, p: progress(c, answers, files, creds) };
  });

  // ---- Overview
  const ov = wb.addWorksheet("Overview");
  ov.columns = [
    { header: "Company", key: "company", width: 36 },
    { header: "Contact", key: "contact", width: 22 },
    { header: "Email", key: "email", width: 28 },
    { header: "Phone", key: "phone", width: 16 },
    { header: "Status", key: "status", width: 16 },
    { header: "% complete", key: "pct", width: 11 },
    { header: "Services", key: "services", width: 28 },
    { header: "Still needed", key: "missing", width: 40 },
    { header: "Logins pending", key: "logins", width: 40 },
    { header: "Created", key: "created", width: 20 },
    { header: "Submitted", key: "submitted", width: 20 },
    { header: "Last update", key: "updated", width: 20 },
    { header: "Open in portal", key: "url", width: 18 },
  ];
  for (const { c, answers, p } of data) {
    const row = ov.addRow({
      company: c.company,
      contact: c.contact_name,
      email: c.email,
      phone: String(answers.profile?.phone ?? ""),
      status: STATUS_LABEL[c.status],
      pct: p.percent / 100,
      services: c.services.map((s) => FORMS[s]?.title).filter(Boolean).join(", "),
      missing: p.missingRequired.join("\n"),
      logins: p.credsPending.join(", "),
      created: fmtDate(c.created_at),
      submitted: fmtDate(c.submitted_at),
      updated: fmtDate(c.updated_at),
      url: { text: "Open", hyperlink: `${APP_URL}/admin/clients/${c.id}` },
    });
    row.getCell("pct").numFmt = "0%";
  }
  styleHeader(ov);
  wrapBody(ov);

  // ---- One sheet per form
  const usedForms: FormTemplate[] = [];
  for (const { c } of data) for (const f of formsForClient(c.services)) if (!usedForms.includes(f)) usedForms.push(f);
  for (const form of usedForms) {
    const ws = wb.addWorksheet(form.title.slice(0, 31));
    const fields = form.sections.flatMap((s) => s.fields.map((f) => ({ s, f })));
    ws.columns = [
      { header: "Client", key: "__client", width: 32 },
      ...fields.map(({ f }) => ({
        header: f.label,
        key: f.key,
        width: f.type === "textarea" || f.type === "repeater" ? 42 : f.type === "file" ? 34 : 24,
      })),
    ];
    for (const { c, answers, files } of data) {
      if (!formsForClient(c.services).includes(form)) continue;
      const values: Record<string, string> = { __client: c.company };
      for (const { f } of fields) {
        values[f.key] =
          f.type === "file"
            ? files
                .filter((x) => x.form_key === form.key && x.field_key === f.key)
                .map((x) => `${x.original_name} (${APP_URL}/api/files/${x.id})`)
                .join("\n")
            : formatAnswer(f, answers[form.key]?.[f.key]);
      }
      ws.addRow(values);
    }
    styleHeader(ws);
    wrapBody(ws);
  }

  // ---- Logins (status only)
  const lg = wb.addWorksheet("Logins (no passwords)");
  lg.columns = [
    { header: "Company", key: "company", width: 32 },
    { header: "Platform", key: "platform", width: 34 },
    { header: "Status", key: "status", width: 22 },
    { header: "Username", key: "username", width: 28 },
    { header: "Notes", key: "notes", width: 40 },
  ];
  for (const { c, creds } of data)
    for (const cr of creds)
      lg.addRow({
        company: c.company,
        platform: cr.platform,
        status: cr.not_applicable ? "Doesn't have this" : cr.username || cr.has_password ? "Provided" : "Pending",
        username: cr.username,
        notes: cr.notes,
      });
  styleHeader(lg);
  wrapBody(lg);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
