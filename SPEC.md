# Client Onboarding Portal — Build Spec (draft v1)

Status: **Phase 1 + most of Phase 2 built locally (`portal/`), not yet deployed** · Last updated: 2026-11-19

## Decisions since v1 (these override the sections below)
- **No email at all** (agency's decision). The portal sends nothing. The admin shares links with **Copy welcome message** and
  **Copy reminder message** (pasted into WhatsApp, SMS or GHL). Team alerts are dashboard badges: *New activity*,
  *N change requests*, *Quiet N days: send a reminder*. Email code is dormant and only switches on if SMTP is ever configured.
- **Excel replaces the Google Sheet.** "Export all to Excel" on the dashboard and "Excel" per client. The workbook has an Overview
  sheet, one sheet per service form (one row per client) and a logins *status* sheet. **No passwords.**
- PDF Client Brief per client (no passwords), plus the separate password-protected Credentials PDF.
- All data stays stored in the portal (its SQLite database), and exports are snapshots.
- Domain: **onboard.growmysecuritycompany.com**, DNS live → 72.167.37.39.
- Built in Phase 2: section locking, change requests (approve = unlock), change history ("Changed … Was: …"),
  Social Media and Google Business Profile forms.

## 1. Purpose
A white-label portal for the agency to collect everything it needs from each new client in one place:
details, brand assets, content and platform access. Nothing gets lost and nothing has to be asked twice.
Everyone working on the client sees the same up-to-date information.

## 2. Users & roles
| Role | Who | Can do |
|---|---|---|
| **Super Admin** | Developer (white-label partner) | Everything, plus system settings, backups and templates. Never shown to clients. |
| **Agency Admin** | Agency owner (main admin) | Create clients, send invites, view/approve everything, lock/unlock sections, export |
| **Client** | Agency's customer | Opens a private link, fills in their forms, uploads files, requests changes to locked sections |
| Employees | Agency staff | **No portal login.** They get client details through the PDF brief and the Google Sheet (see section 6a). |

**White-label rule:** clients see only the agency's name, logo, colors and email sender. The developer's brand never appears.

## 3. Forms per service
- **Company Profile (shared):** filled **once per client**, reused by every service form, never asked twice.
  Company name, contact, phone, email, website, address, extra locations, target audience/industries,
  3 competitors (name + URL), services offered (repeatable rows), brand colors (hex picker), logo, brand guidelines.
- **Service templates** (the agency picks one or more per client):
  - Website: sitemap/pages, page-by-page content and images, lead email, CRM, forms, careers page needs
  - SEO / GEO: target keywords, service areas, priority services, competitors to beat
  - Social Media: platforms, tone, posting goals, photo/video assets
  - Google Business Profile: categories, hours, service areas, photos
  - *(more added as needed)*
- Phase 1: templates are defined in code (fast, reliable). Phase 2 (if approved): a drag-and-drop form builder.

## 4. Access collection: simple login fields (encrypted vault)
Low effort for the client: one row per platform with **Username / Password / Notes**, plus a "Don't have this" tick box.
Platforms: hosting, domain registrar, WordPress, Google Business Profile, Google Analytics/Search Console, Facebook, Instagram, LinkedIn, etc.
The client can add custom rows.

Security (because the portal stores live passwords):
- Passwords are encrypted (AES-256-GCM) before saving. The key lives in a server env file, **not** in the database or the backups.
- Passwords are masked by default. Only admins can click **Reveal / Copy**, and every reveal is logged (who, when).
- The client link can update credentials but never shows saved passwords back.
- HTTPS only. Admin login with 2FA.
- Note: many Google and Meta logins send a 2FA code to the client's phone, so the team may still need the client once on the first login.

## 5. Editing without endless changes
Clients **can** edit after submitting, but changes are controlled so work isn't disrupted:
1. **Open:** the client edits freely while the agency is still collecting.
2. **Locked:** when the agency starts working on a section, the admin locks it (e.g. once content is approved and the website build begins).
3. **Change request:** on a locked section, the client cannot overwrite the data. They submit a change request ("what and why").
   The admin approves (the change is applied) or declines it, with a note.
4. **Change history:** every edit is recorded (old value → new value, who, when). Changed fields are highlighted for the team.
5. **One digest notification** per editing session, not one email per keystroke.

## 6. Core flows
1. Admin creates client → picks service templates → clicks **Send invite** (branded email with private link).
2. Client fills in forms with autosave, uploads files, can leave and come back. A progress bar shows % complete.
3. Auto-reminders for missing items (e.g. after 3 and 7 days). The schedule can be configured.
4. Client submits → admin is notified → status: Not started → In progress → Submitted → In work → Complete.
5. Admin views the client page: all answers, file gallery, access checklist, change history, internal notes.
6. Admin can add a new question or file request to an existing client. The client is notified.
7. Export: PDF of answers plus a ZIP of files (see 6a).

## 6a. Sharing with employees (PDF + Google Sheet, no portal access)
- **Client Brief PDF:** a clean, agency-branded PDF of all details and links to the uploaded files. **No passwords.**
  Generated automatically on submit and regenerated after approved changes. The admin can download it or email it to chosen employees.
- **Google Sheet:** one shared sheet with one row per client (and a tab per service form). It updates automatically when
  the client submits or a change is approved. **No passwords.** File links in the sheet open the upload, via a signed link or a Drive copy.
- **Credentials PDF (separate):** logins only, in a **password-protected PDF** that the admin generates on demand for the people who need it.
  The PDF's open password is shared separately (call or chat), never in the same email.
  Every generation is logged. Passwords stay encrypted in the portal as the master copy.
- Version label on each PDF (e.g. "v3 · updated 21 Nov") so employees know if they have the latest copy.

## 7. Tech stack (proposed)
| Part | Choice | Reason |
|---|---|---|
| App | Next.js + TypeScript | One app for the admin and client pages |
| Database | SQLite (single file) + Drizzle ORM | No new DB server on the VPS. Isolated from the CRM. Easy backup. |
| Files | VPS disk `/var/www/onboard/uploads`, 200 MB/file cap | Large videos go by Drive/Dropbox link |
| Admin login | Email + password with 2FA option | Only 2 admin accounts |
| Client access | Long random token link, revocable, optional expiry | No client passwords |
| Email | Resend or the agency's SMTP, sent from the agency's domain | White-label |
| Process | PM2, port 3100 | Separate from the CRM process |
| Web | One new nginx/Apache server block + Let's Encrypt SSL | `onboard.<agency-domain>` |
| Backups | Nightly cron: DB + uploads, keep 14 days | |
| PDF | Server-side PDF generation (e.g. pdf-lib/React-PDF); credentials PDF encrypted with qpdf | Small, runs only on demand |
| Google Sheet | Google Sheets API via a Google service account, shared with the agency's Google account | Outbound API calls only. Nothing new runs on the VPS. |

## 8. Effect on the shared VPS (CRM)
- RAM ~250 MB, low CPU, disk grows with uploads.
- Only shared touchpoint: **one new web server config block**, tested before a graceful reload (no CRM downtime).
- No changes to the CRM's code, database, ports or existing config.
- Undo plan: stop the PM2 process, remove the server block, reload. The CRM is unaffected.

## 9. Phases
- **Phase 1 (MVP):** admin login, white-label settings, clients, Company Profile + 2 service templates (Website, SEO),
  invite links, autosave, uploads, encrypted credentials, submit + email notification, client dashboard,
  Client Brief PDF + Credentials PDF.
- **Phase 2:** locking + change requests + change history, auto-reminders, remaining templates, Google Sheet sync, ZIP export.
- **Phase 3:** form builder, AI project brief, CRM integration (push client to the existing CRM), kickoff call booking.

## 10. Open items
- [ ] VPS: OS, free RAM/disk, web server (nginx / Apache / control panel), how the CRM runs (PM2 / Docker / other)
- [ ] Agency's real domain for `onboard.<domain>` and the DNS access to add the record
- [ ] Email sender: Resend (needs SPF/DKIM DNS records on the agency domain) or existing SMTP
- [ ] Google account that will own the shared Sheet (for Phase 2 Sheet sync)
- [ ] Approve Section 5 editing rules
- [ ] Approve Section 7 stack and Section 9 phase scope
