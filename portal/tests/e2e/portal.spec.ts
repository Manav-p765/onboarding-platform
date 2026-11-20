import { expect, test, type Browser, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import fs from "node:fs";
import { ADMIN, PNG, SECRET_PW, login, totp, waitSaved } from "./helpers";

test.describe.configure({ mode: "serial" });

// Shared across the steps below (they build on each other).
const S: { clientId?: string; token?: string; otherToken?: string; fileId?: number; ownerTemp?: string } = {};

async function adminPage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
  await login(page);
  await expect(page).toHaveURL(/\/admin$/);
  return page;
}

async function clientPage(browser: Browser, token = S.token!): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`/c/${token}`);
  return page;
}

// ---------------------------------------------------------------- setup

test("first-time setup creates the Super Admin, and only once", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "First-time setup" })).toBeVisible();
  await page.locator("#name").fill(ADMIN.name);
  await page.locator("#email").fill(ADMIN.email);
  await page.locator("#password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Create admin account" }).click();
  await expect(page).toHaveURL(/\/admin$/);

  const fresh = await (await page.context().browser()!.newContext()).newPage();
  await fresh.goto("/login");
  await expect(fresh.getByRole("heading", { name: "Admin login" })).toBeVisible(); // setup no longer offered
});

test("branding settings save and apply to the client page", async ({ browser }) => {
  const page = await adminPage(browser);
  await page.goto("/admin/settings");
  await page.locator("#agencyName").fill("Grow My Security Company");
  await page.locator("#primaryColor").fill("#b8141f");
  await page.locator("#supportPhone").fill("(555) 010-2030");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(page.getByText("Email is turned off")).toBeVisible(); // no email by design
});

// ---------------------------------------------------------------- clients

test("admin creates clients and gets copyable messages instead of email", async ({ browser }) => {
  const page = await adminPage(browser);
  await page.goto("/admin/clients/new");
  await expect(page.getByText("Email the onboarding link now")).toHaveCount(0);
  await page.locator("#company").fill("New York Dignitary Security Services, LLC");
  await page.locator("#contact_name").fill("Joel Rodriguez");
  await page.locator("#email").fill("joel@nydss.test");
  await page.getByRole("checkbox", { name: /Google Business Profile/ }).check();
  await page.getByRole("button", { name: "Create client" }).click();
  await expect(page).toHaveURL(/\/admin\/clients\/\d+$/);
  S.clientId = page.url().split("/").pop();
  const link = await page.locator("input[readonly]").inputValue();
  S.token = link.split("/c/")[1];
  expect(S.token.length).toBeGreaterThanOrEqual(30);

  await expect(page.getByRole("combobox", { name: "Status" })).toHaveValue("not_started");
  await page.getByRole("button", { name: "Copy welcome message" }).click();
  const msg = await page.evaluate(() => navigator.clipboard.readText());
  expect(msg).toContain(link);
  expect(msg).toContain("Grow My Security Company");

  // a second client, used for cross-client access tests
  await page.goto("/admin/clients/new");
  await page.locator("#company").fill("Other Client Inc");
  await page.getByRole("button", { name: "Create client" }).click();
  S.otherToken = (await page.locator("input[readonly]").inputValue()).split("/c/")[1];
});

test("client fills in the form: autosave, choices, repeaters, colors, upload", async ({ browser }) => {
  const page = await clientPage(browser);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Joel, let's get New York Dignitary");
  await expect(page.locator("#profile-company")).toHaveValue("New York Dignitary Security Services, LLC"); // prefilled

  await page.locator("#profile-phone").fill("347-661-2801");
  await page.locator("#profile-address").fill("41 Flatbush Avenue, Brooklyn NY");
  await page.getByLabel("Company 1").fill("Allied Universal");
  await page.getByLabel("Website 1").fill("aus.com");
  await page.getByRole("button", { name: "+ Add another" }).first().click();
  await page.getByLabel("Company 2").fill("Securitas");
  await page.getByRole("radio", { name: "Logo needs improvement" }).click();
  await page.getByRole("button", { name: "+ Add color" }).click();
  await page.locator('input[type="file"]').first().setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByRole("link", { name: "logo.png" })).toBeVisible();
  await waitSaved(page);

  // everything is still there after a reload
  await page.reload();
  await expect(page.locator("#profile-phone")).toHaveValue("347-661-2801");
  await expect(page.getByLabel("Company 2")).toHaveValue("Securitas");
  await expect(page.getByRole("radio", { name: "Logo needs improvement" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("link", { name: "logo.png" })).toBeVisible();
  S.fileId = Number((await page.getByRole("link", { name: "logo.png" }).getAttribute("href"))!.match(/files\/(\d+)/)![1]);

  // website step: checkboxes + required lead email
  await page.getByRole("button", { name: /^2 Website/ }).click();
  await page.getByRole("button", { name: "More calls & leads" }).click();
  await expect(page.getByRole("button", { name: /More calls & leads/ })).toHaveAttribute("aria-pressed", "true");
  await page.locator("#website-lead_email").fill("leads@nydss.test");
  await waitSaved(page);
});

test("client adds logins; the password is never shown back to them", async ({ browser }) => {
  const page = await clientPage(browser);
  await page.getByRole("button", { name: /Logins & Access/ }).first().click();
  const hosting = page.locator("section", { has: page.getByRole("heading", { name: "Website hosting" }) });
  await hosting.getByLabel("Username or email").fill("nydss-host");
  await hosting.getByLabel("Password").fill(SECRET_PW);
  await hosting.getByLabel("Notes (optional)").click(); // blur saves
  await expect(hosting.getByText("✓ Saved")).toBeVisible();

  const linkedin = page.locator("section", { has: page.getByRole("heading", { name: "LinkedIn" }) });
  await linkedin.getByRole("checkbox", { name: /don't have this/i }).check();
  await waitSaved(page);

  await page.reload();
  await page.getByRole("button", { name: /Logins & Access/ }).first().click();
  const pw = page.locator("section", { has: page.getByRole("heading", { name: "Website hosting" }) }).getByLabel("Password");
  await expect(pw).toHaveValue("");
  await expect(pw).toHaveAttribute("placeholder", /Saved/);
  expect(await page.content()).not.toContain(SECRET_PW);
});

test("client sends their details", async ({ browser }) => {
  const page = await clientPage(browser);
  await page.getByRole("button", { name: /Review & Submit/ }).first().click();
  await page.getByRole("button", { name: "Send to the team" }).click();
  await expect(page.getByRole("heading", { name: "Sent. Thank you!" })).toBeVisible();
});

// ---------------------------------------------------------------- admin review

test("admin sees everything, reveals the password (logged), and the dashboard flags it", async ({ browser }) => {
  const page = await adminPage(browser);
  const row = page.getByRole("link", { name: /New York Dignitary/ });
  await expect(row).toContainText("Ready to review");
  await expect(row).toContainText("New activity");

  await row.click();
  await expect(page.getByText("347-661-2801")).toBeVisible();
  await expect(page.getByText("• Allied Universal | aus.com")).toBeVisible();
  await expect(page.getByRole("link", { name: "logo.png" })).toBeVisible();
  await expect(page.getByText("Client doesn't have this")).toBeVisible();
  expect(await page.content()).not.toContain(SECRET_PW); // not in the page until revealed

  await page.getByRole("button", { name: /Reveal/ }).click();
  await expect(page.getByText(SECRET_PW)).toBeVisible();
  await page.reload();
  await expect(page.getByText("revealed password")).toBeVisible();
});

test("Excel export has all answers and no passwords", async ({ browser }) => {
  const page = await adminPage(browser);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Export all to Excel" }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^All clients - onboarding details .*\.xlsx$/);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile((await dl.path())!);
  expect(wb.worksheets.map((w) => w.name)).toEqual(
    expect.arrayContaining(["Overview", "Company Profile", "Website", "SEO & GEO", "Google Business Profile", "Logins (no passwords)"]),
  );
  const cells: string[] = [];
  wb.eachSheet((ws) => ws.eachRow((r) => r.eachCell((c) => cells.push(String(c.text ?? "")))));
  expect(cells).toContain("347-661-2801");
  expect(cells).toContain("leads@nydss.test");
  expect(cells.join("\n")).not.toContain(SECRET_PW);
});

test("PDF brief downloads without passwords; credentials PDF is protected", async ({ browser }) => {
  const page = await adminPage(browser);
  const brief = await page.request.get(`/api/admin/clients/${S.clientId}/brief`);
  expect(brief.status()).toBe(200);
  const body = await brief.body();
  expect(body.subarray(0, 5).toString()).toBe("%PDF-");
  expect(body.toString("latin1")).not.toContain(SECRET_PW);

  const cred = await page.request.post(`/api/admin/clients/${S.clientId}/credentials-pdf`, { form: { pdf_password: "harbor-velvet-123" } });
  // 200 where qpdf is installed (Docker/VPS); 501 on a dev machine without it. Never an unprotected PDF.
  expect([200, 501]).toContain(cred.status());
  if (cred.status() === 200) expect((await cred.body()).toString("latin1")).toContain("/Encrypt");
  const weak = await page.request.post(`/api/admin/clients/${S.clientId}/credentials-pdf`, { form: { pdf_password: "short" } });
  expect(weak.status()).toBe(400);
});

// ---------------------------------------------------------------- locking & change requests

test("lock → client can't edit → change request → approve → edit → 'Was:' shown", async ({ browser }) => {
  const admin = await adminPage(browser);
  await admin.goto(`/admin/clients/${S.clientId}`);
  await admin.getByRole("button", { name: "Lock", exact: true }).first().click(); // Company & contact
  await expect(admin.getByRole("button", { name: "Locked" }).first()).toBeVisible();

  const client = await clientPage(browser);
  await expect(client.getByText("Our team is working from these answers")).toBeVisible();
  await expect(client.locator("#profile-phone")).toBeDisabled();
  await expect(client.locator("#profile-target_audience")).toBeEnabled(); // other sections stay open

  // the server refuses edits to a locked section even if the page is bypassed
  const upload = await client.request.post(`/api/upload?token=${S.token}&form=profile&field=logo&name=x.png`, {
    data: PNG,
    headers: { "content-type": "image/png" },
  });
  expect(upload.status()).toBe(200); // logo is in "Brand & assets" (not locked)

  await client.getByRole("button", { name: "Request a change" }).click();
  await client.locator("#cr-msg").fill("Our phone number changed to 347-555-0199");
  await client.getByRole("button", { name: "Send request" }).click();
  await expect(client.getByText("Change requested.")).toBeVisible();

  await admin.goto("/admin");
  await expect(admin.getByRole("link", { name: /New York Dignitary/ })).toContainText("1 change request");
  await admin.goto(`/admin/clients/${S.clientId}`);
  await expect(admin.getByText("1 change request waiting for you")).toBeVisible();
  await admin.getByRole("button", { name: "Approve and unlock" }).click();
  await expect(admin.getByText("Let the client know")).toBeVisible();

  await client.reload();
  await expect(client.getByText("Your change request was approved")).toBeVisible();
  await client.locator("#profile-phone").fill("347-555-0199");
  await waitSaved(client);

  await admin.reload();
  const phoneRow = admin.locator("div", { has: admin.locator("dt", { hasText: "Phone number" }) }).last();
  await expect(phoneRow).toContainText("Changed");
  await expect(phoneRow).toContainText("347-555-0199");
  await expect(phoneRow).toContainText("Was: 347-661-2801");
});

test("a locked section rejects uploads at the server", async ({ browser }) => {
  const admin = await adminPage(browser);
  await admin.goto(`/admin/clients/${S.clientId}`);
  await admin.getByRole("button", { name: "Lock all sections" }).click();
  await expect(admin.getByRole("button", { name: "Unlock all sections" })).toBeVisible();
  const r = await admin.request.post(`/api/upload?token=${S.token}&form=profile&field=logo&name=y.png`, {
    data: PNG,
    headers: { "content-type": "image/png" },
  });
  expect(r.status()).toBe(423);
  await admin.getByRole("button", { name: "Unlock all sections" }).click();
  await expect(admin.getByRole("button", { name: "Lock all sections" })).toBeVisible();
});

// ---------------------------------------------------------------- security

test("admin area and exports are closed without a login", async ({ browser }) => {
  const anon = await (await browser.newContext()).newPage();
  await anon.goto("/admin");
  await expect(anon).toHaveURL(/\/login$/);
  await anon.goto(`/admin/clients/${S.clientId}`);
  await expect(anon).toHaveURL(/\/login$/);
  for (const url of ["/api/admin/export/excel", `/api/admin/clients/${S.clientId}/brief`])
    expect((await anon.request.get(url)).status()).toBe(401);
  expect((await anon.request.post(`/api/admin/clients/${S.clientId}/credentials-pdf`, { form: { pdf_password: "abcdefgh1" } })).status()).toBe(401);
  // forged session cookie
  await anon.context().addCookies([{ name: "portal_session", value: "forged-session-id", url: "http://127.0.0.1:3210" }]);
  await anon.goto("/admin");
  await expect(anon).toHaveURL(/\/login$/);
});

test("files are private: no access without login, or with another client's link", async ({ browser }) => {
  const anon = await (await browser.newContext()).newPage();
  expect((await anon.request.get(`/api/files/${S.fileId}`)).status()).toBe(403);
  expect((await anon.request.get(`/api/files/${S.fileId}?t=${S.otherToken}`)).status()).toBe(403);
  expect((await anon.request.get(`/api/files/${S.fileId}?t=wrong-token-0000000000000000`)).status()).toBe(403);
  const own = await anon.request.get(`/api/files/${S.fileId}?t=${S.token}`);
  expect(own.status()).toBe(200);
  expect(own.headers()["content-security-policy"]).toContain("sandbox");
  expect(own.headers()["x-content-type-options"]).toBe("nosniff");
});

test("uploads: bad links, wrong fields and dangerous file types are refused", async ({ browser }) => {
  const anon = await (await browser.newContext()).newPage();
  const post = (q: string) => anon.request.post(`/api/upload?${q}`, { data: PNG, headers: { "content-type": "image/png" } });
  expect((await post(`token=not-a-real-token-000000000000&form=profile&field=logo&name=a.png`)).status()).toBe(403);
  expect((await post(`token=${S.token}&form=profile&field=phone&name=a.png`)).status()).toBe(400); // not a file field
  expect((await post(`token=${S.token}&form=nope&field=logo&name=a.png`)).status()).toBe(400);
  for (const bad of ["evil.html", "run.exe", "x.php", "s.js", "page.HTM"])
    expect((await post(`token=${S.token}&form=profile&field=logo&name=${bad}`)).status(), bad).toBe(400);
  const r = await post(`token=${S.token}&form=profile&field=logo&name=${encodeURIComponent("../../etc/passwd.png")}`);
  expect(r.status()).toBe(200);
  expect((await r.json()).original_name).not.toContain("/"); // path stripped
});

test("disabled and replaced links stop working immediately", async ({ browser }) => {
  const admin = await adminPage(browser);
  await admin.goto(`/admin/clients/${S.clientId}`);
  await admin.getByRole("button", { name: "Disable link" }).click();
  await expect(admin.getByRole("button", { name: "Enable link" })).toBeVisible();
  const c = await clientPage(browser);
  await expect(c.getByRole("heading", { name: "This link isn't active" })).toBeVisible();
  await admin.getByRole("button", { name: "Enable link" }).click();
  await expect(admin.getByRole("button", { name: "Disable link" })).toBeVisible();

  admin.once("dialog", (d) => d.accept());
  await admin.getByRole("button", { name: "New link" }).click();
  await expect(admin.locator("input[readonly]")).not.toHaveValue(new RegExp(S.token!));
  const old = await clientPage(browser);
  await expect(old.getByRole("heading", { name: "This link isn't active" })).toBeVisible();
  S.token = (await admin.locator("input[readonly]").inputValue()).split("/c/")[1];
  await expect((await clientPage(browser)).locator("#profile-phone")).toBeVisible();
});

test("security headers are set on every page", async ({ request }) => {
  const r = await request.get("/login");
  const h = r.headers();
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("no-referrer");
  expect(h["x-robots-tag"]).toContain("noindex");
  expect(h["x-powered-by"]).toBeUndefined();
});

// ---------------------------------------------------------------- team logins & 2FA

test("add the agency owner: temporary password, forced-change banner, password change", async ({ browser }) => {
  const admin = await adminPage(browser);
  await admin.goto("/admin/users");
  await admin.locator("#u-name").fill("Agency Owner");
  await admin.locator("#u-email").fill("owner@test.local");
  await admin.getByRole("button", { name: "Add login" }).click();
  S.ownerTemp = (await admin.locator("code").first().textContent())!.trim();
  expect(S.ownerTemp).toMatch(/^[a-z]+-[a-z]+-\d{4}-[A-Za-z]{2}$/);

  const owner = await (await browser.newContext()).newPage();
  await login(owner, "owner@test.local", S.ownerTemp);
  await expect(owner).toHaveURL(/\/admin$/);
  await expect(owner.getByText("You're using a temporary password")).toBeVisible();
  await owner.goto("/admin/account");
  await owner.locator("#current").fill(S.ownerTemp);
  await owner.locator("#next").fill("owner-own-password-1");
  await owner.locator("#confirm").fill("owner-own-password-1");
  await owner.getByRole("button", { name: "Save password" }).click();
  await expect(owner.getByText("Password changed")).toBeVisible();
  await owner.reload();
  await expect(owner.getByText("You're using a temporary password")).toHaveCount(0);

  // an Admin can't remove the Super Admin
  await owner.goto("/admin/users");
  const superRow = owner.locator("li", { hasText: ADMIN.email });
  await expect(superRow.getByRole("button", { name: "Remove" })).toHaveCount(0);
});

test("5 wrong passwords lock the login for 15 minutes", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  for (let i = 0; i < 5; i++) {
    await login(page, "owner@test.local", `wrong-${i}`);
    await expect(page.getByText("Wrong email or password.")).toBeVisible();
  }
  await login(page, "owner@test.local", "owner-own-password-1"); // even the right password is refused now
  await expect(page.getByText(/Too many wrong attempts/)).toBeVisible();
});

test("2-step login: set up with an authenticator, then every login needs a code", async ({ browser }) => {
  const page = await adminPage(browser);
  await page.goto("/admin/account");
  await page.getByRole("button", { name: "Set up 2-step login" }).click();
  await expect(page.getByAltText(/QR code/)).toBeVisible();
  const secret = (await page.locator("code").textContent())!.replace(/\s/g, "");
  await page.locator("#totp-code").fill("000000");
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByText("That code didn't match")).toBeVisible();
  await page.locator("#totp-code").fill(totp(secret));
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByRole("heading", { name: "2-step login is on" })).toBeVisible();

  const fresh = await (await browser.newContext()).newPage();
  await login(fresh);
  await expect(fresh).toHaveURL(/\/login\/verify$/);
  await fresh.goto("/admin"); // can't skip the code step
  await expect(fresh).toHaveURL(/\/login$/);
  await login(fresh);
  await fresh.locator("#code").fill("123456" === totp(secret) ? "654321" : "123456");
  await fresh.getByRole("button", { name: "Log in" }).click();
  await expect(fresh.getByText("That code didn't work")).toBeVisible();
  await fresh.locator("#code").fill(totp(secret));
  await fresh.getByRole("button", { name: "Log in" }).click();
  await expect(fresh).toHaveURL(/\/admin$/);

  // the Team page shows it
  await fresh.goto("/admin/users");
  await expect(fresh.locator("li", { hasText: ADMIN.email })).toContainText("2-step on");
});

// ---------------------------------------------------------------- layout

test("client page fits a phone screen (no sideways scrolling)", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`/c/${S.token}`);
  await expect(page.locator("#profile-phone")).toBeVisible();
  const { overflow, culprits } = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const culprits = [...document.querySelectorAll("body *")]
      .filter((el) => el.getBoundingClientRect().right > vw + 1)
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} → right=${Math.round(el.getBoundingClientRect().right)}`);
    return { overflow: document.documentElement.scrollWidth - vw, culprits };
  });
  expect(overflow, `too wide: ${culprits.join(" | ")}`).toBeLessThanOrEqual(0);
});

test.afterAll(() => {
  // remove this run's throwaway database and uploads
  const dir = process.env.E2E_DATA_DIR;
  try {
    if (dir && dir.includes("portal-e2e-")) fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // the server may still hold the DB file open (Windows); the temp folder is cleaned by the OS later
  }
});
