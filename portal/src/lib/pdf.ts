import "server-only";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { allPasswords, getAnswers, listCredentials, listFiles, type Client } from "./clients";
import { formsForClient } from "./forms";
import { fmtDate, formatAnswer, formatBytes } from "./format";
import { getBranding } from "./settings";
import { APP_URL } from "./mail";
import { randomToken } from "./crypto";

const A4 = { w: 595.28, h: 841.89 };
const M = 48; // margin

function hexToRgb(hex: string) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255) : rgb(0.04, 0.29, 0.55);
}

/** Standard PDF fonts only support WinAnsi; replace anything else. */
const safe = (s: string) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\r/g, "")
    .replace(/[^\n\x20-\x7e -ÿ•]/g, "?");

class Writer {
  page!: PDFPage;
  y = 0;
  constructor(
    private doc: PDFDocument,
    private font: PDFFont,
    private bold: PDFFont,
    private brand: ReturnType<typeof rgb>,
    private footer: string,
  ) {
    this.newPage();
  }
  newPage() {
    this.page = this.doc.addPage([A4.w, A4.h]);
    this.y = A4.h - M;
    this.page.drawText(safe(this.footer), { x: M, y: 24, size: 8, font: this.font, color: rgb(0.5, 0.5, 0.5) });
  }
  ensure(h: number) {
    if (this.y - h < M) this.newPage();
  }
  wrap(text: string, size: number, width: number, f = this.font): string[] {
    const out: string[] = [];
    for (const para of safe(text).split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/)) {
        const test = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(test, size) <= width) line = test;
        else {
          if (line) out.push(line);
          // hard-break very long words (URLs)
          let w = word;
          while (f.widthOfTextAtSize(w, size) > width) {
            let i = w.length;
            while (i > 1 && f.widthOfTextAtSize(w.slice(0, i), size) > width) i--;
            out.push(w.slice(0, i));
            w = w.slice(i);
          }
          line = w;
        }
      }
      out.push(line);
    }
    return out;
  }
  title(text: string, size = 18) {
    this.ensure(size + 10);
    this.page.drawText(safe(text), { x: M, y: this.y - size, size, font: this.bold, color: rgb(0.08, 0.1, 0.12) });
    this.y -= size + 8;
  }
  heading(text: string) {
    this.ensure(40);
    this.y -= 10;
    this.page.drawRectangle({ x: M, y: this.y - 20, width: A4.w - 2 * M, height: 20, color: this.brand });
    this.page.drawText(safe(text), { x: M + 8, y: this.y - 14, size: 10.5, font: this.bold, color: rgb(1, 1, 1) });
    this.y -= 26;
  }
  sub(text: string) {
    this.ensure(24);
    this.y -= 4;
    this.page.drawText(safe(text.toUpperCase()), { x: M, y: this.y - 9, size: 8, font: this.bold, color: rgb(0.4, 0.45, 0.5) });
    this.y -= 15;
  }
  text(text: string, size = 9.5, color = rgb(0.3, 0.33, 0.38)) {
    for (const l of this.wrap(text, size, A4.w - 2 * M)) {
      this.ensure(size + 4);
      this.page.drawText(l, { x: M, y: this.y - size, size, font: this.font, color });
      this.y -= size + 4;
    }
  }
  row(label: string, value: string) {
    const size = 9.5;
    const labelW = 165;
    const valW = A4.w - 2 * M - labelW - 10;
    const lLines = this.wrap(label, size, labelW, this.bold);
    const vLines = value ? this.wrap(value, size, valW) : ["-"];
    const h = Math.max(lLines.length, vLines.length) * (size + 4) + 8;
    if (h < A4.h - 2 * M) this.ensure(h);
    let ly = this.y - 4;
    for (const l of lLines) {
      this.page.drawText(l, { x: M, y: ly - size, size, font: this.bold, color: rgb(0.25, 0.28, 0.32) });
      ly -= size + 4;
    }
    let vy = this.y - 4;
    for (const l of vLines) {
      if (vy - size < M) {
        this.newPage();
        vy = this.y - 4;
      }
      this.page.drawText(l, { x: M + labelW + 10, y: vy - size, size, font: this.font, color: value ? rgb(0.08, 0.1, 0.12) : rgb(0.65, 0.65, 0.65) });
      vy -= size + 4;
    }
    this.y = Math.min(ly, vy) - 4;
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: A4.w - M, y: this.y }, thickness: 0.5, color: rgb(0.89, 0.9, 0.92) });
  }
}

async function setup(title: string, footer: string) {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setProducer("Client Onboarding");
  doc.setCreator(getBranding().agencyName);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  return { doc, w: new Writer(doc, font, bold, hexToRgb(getBranding().primaryColor), footer) };
}

/** Client Brief: all details, file links. NO passwords. */
export async function buildBriefPdf(client: Client): Promise<Uint8Array> {
  const b = getBranding();
  const answers = getAnswers(client.id);
  const files = listFiles(client.id);
  const creds = listCredentials(client.id);
  const stamp = `v${Math.max(client.version, 1)} - generated ${fmtDate(new Date().toISOString())}`;
  const { doc, w } = await setup(`${client.company} - Client Brief`, `${b.agencyName} - ${client.company} - Client Brief ${stamp} - Confidential`);

  w.text(b.agencyName, 9, rgb(0.4, 0.45, 0.5));
  w.title(client.company, 22);
  w.text(`Client Brief - ${stamp}${client.submitted_at ? ` - submitted ${fmtDate(client.submitted_at)}` : ""}`);

  for (const form of formsForClient(client.services)) {
    w.heading(form.title);
    for (const s of form.sections) {
      w.sub(s.title);
      for (const f of s.fields) {
        if (f.type === "file") {
          const list = files.filter((x) => x.form_key === form.key && x.field_key === f.key);
          w.row(f.label, list.map((x) => `${x.original_name} (${formatBytes(x.size)}) ${APP_URL}/api/files/${x.id}`).join("\n"));
        } else {
          w.row(f.label, formatAnswer(f, answers[form.key]?.[f.key]));
        }
      }
    }
  }

  w.heading("Logins & access (status only)");
  w.text("Passwords are not included in this document. Ask the account admin for the protected Credentials PDF.", 8.5);
  for (const c of creds) {
    const status = c.not_applicable ? "Client doesn't have this" : c.username || c.has_password ? `Provided${c.username ? ` - user: ${c.username}` : ""}` : "Pending";
    w.row(c.platform, status);
  }
  return doc.save();
}

/** Credentials only, encrypted with a password via qpdf (AES-256). */
export async function buildCredentialsPdf(client: Client, openPassword: string): Promise<Uint8Array> {
  const b = getBranding();
  const { doc, w } = await setup(`${client.company} - Credentials`, `${b.agencyName} - ${client.company} - CONFIDENTIAL - do not forward`);
  w.title(`${client.company} - Logins`, 18);
  w.text(`Generated ${fmtDate(new Date().toISOString())}. Confidential. Do not forward or store unprotected.`);
  const rows = allPasswords(client.id);
  if (!rows.length) w.text("No logins provided yet.");
  for (const r of rows) {
    w.heading(r.platform);
    if (r.login_url) w.row("Login URL", r.login_url);
    w.row("Username", r.username);
    w.row("Password", r.password);
    if (r.notes) w.row("Notes", r.notes);
  }
  const plain = await doc.save();
  return encryptWithQpdf(plain, openPassword);
}

const run = promisify(execFile);

export async function qpdfAvailable() {
  try {
    await run(process.env.QPDF_PATH || "qpdf", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

async function encryptWithQpdf(pdf: Uint8Array, password: string): Promise<Uint8Array> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cred-"));
  const inp = path.join(dir, "in.pdf");
  const out = path.join(dir, "out.pdf");
  try {
    await fs.writeFile(inp, pdf, { mode: 0o600 });
    // Pass passwords via an @args file so they never appear in the process list.
    const args = path.join(dir, "args");
    await fs.writeFile(args, ["--encrypt", password, randomToken(24), "256", "--", inp, out].join("\n"), { mode: 0o600 });
    await run(process.env.QPDF_PATH || "qpdf", [`@${args}`]);
    return new Uint8Array(await fs.readFile(out));
  } finally {
    await fs.rm(dir, { recursive: true, force: true }); // never leave the unencrypted copy on disk
  }
}
