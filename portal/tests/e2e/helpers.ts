import crypto from "node:crypto";
import { expect, type Page } from "@playwright/test";

export const ADMIN = { name: "Dev Admin", email: "dev@test.local", password: "dev-password-123" };
export const SECRET_PW = "S3cret!Pass-xyz";

/** Same codes a phone authenticator app would show. */
export function totp(secretB32: string, offsetSteps = 0) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secretB32.replace(/\s/g, "")) bits += A.indexOf(c).toString(2).padStart(5, "0");
  const key: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) key.push(parseInt(bits.slice(i, i + 8), 2));
  const m = Buffer.alloc(8);
  m.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30) + offsetSteps));
  const h = crypto.createHmac("sha1", Buffer.from(key)).update(m).digest();
  const o = h[19] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, "0");
}

export async function login(page: Page, email = ADMIN.email, password = ADMIN.password) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

export async function waitSaved(page: Page) {
  await expect(page.getByRole("status")).toHaveText("✓ Saved", { timeout: 10_000 });
}

// 1x1 PNG
export const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
