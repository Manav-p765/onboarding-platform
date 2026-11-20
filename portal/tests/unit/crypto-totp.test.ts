import { afterEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import { decrypt, encrypt, randomToken } from "@/lib/crypto";
import { generateSecret, otpauthUrl, verifyTotp } from "@/lib/totp";

// Independent TOTP implementation (what a phone authenticator app does).
function b32(s: string) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of s) bits += A.indexOf(c).toString(2).padStart(5, "0");
  const out: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}
function phoneCode(secret: string, unixSeconds: number) {
  const m = Buffer.alloc(8);
  m.writeBigUInt64BE(BigInt(Math.floor(unixSeconds / 30)));
  const h = crypto.createHmac("sha1", b32(secret)).update(m).digest();
  const o = h[19] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, "0");
}

describe("encryption of stored client passwords", () => {
  it("round-trips text, including unicode", () => {
    for (const s of ["hunter2", "pässwörd ✓ 🔒", "a".repeat(500)]) expect(decrypt(encrypt(s))).toBe(s);
  });
  it("uses a fresh IV every time (same input → different ciphertext)", () => {
    expect(encrypt("same")).not.toBe(encrypt("same"));
  });
  it("never contains the plain password", () => {
    expect(encrypt("S3cret!Pass")).not.toContain("S3cret");
  });
  it("detects tampering (GCM auth tag)", () => {
    const parts = encrypt("secret").split(".");
    const ct = Buffer.from(parts[2], "base64url");
    ct[0] ^= 1;
    parts[2] = ct.toString("base64url");
    expect(() => decrypt(parts.join("."))).toThrow();
  });
  it("treats empty as empty", () => {
    expect(encrypt("")).toBe("");
    expect(decrypt("")).toBe("");
  });
  it("refuses to run with a missing/short key", () => {
    const old = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = "abc";
    expect(() => encrypt("x")).toThrow(/ENCRYPTION_KEY/);
    process.env.ENCRYPTION_KEY = old;
  });
  it("makes long unguessable tokens", () => {
    const t = randomToken(24);
    expect(t.length).toBeGreaterThanOrEqual(32);
    expect(new Set(Array.from({ length: 200 }, () => randomToken(24))).size).toBe(200);
  });
});

describe("2-step login codes (TOTP)", () => {
  afterEach(() => vi.useRealTimers());

  it("accepts the code a phone app shows right now", () => {
    const s = generateSecret();
    expect(verifyTotp(s, phoneCode(s, Date.now() / 1000))).toBe(true);
  });
  it("accepts one 30-second step of clock drift, but not two", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-20T10:00:15Z"));
    const s = generateSecret();
    const now = Date.now() / 1000;
    expect(verifyTotp(s, phoneCode(s, now - 30))).toBe(true);
    expect(verifyTotp(s, phoneCode(s, now + 30))).toBe(true);
    const far = phoneCode(s, now - 90);
    if (![phoneCode(s, now - 30), phoneCode(s, now), phoneCode(s, now + 30)].includes(far)) expect(verifyTotp(s, far)).toBe(false);
  });
  it("rejects wrong, short and junk codes", () => {
    const s = generateSecret();
    const good = phoneCode(s, Date.now() / 1000);
    const wrong = String((Number(good) + 1) % 1e6).padStart(6, "0");
    expect(verifyTotp(s, wrong)).toBe(false);
    expect(verifyTotp(s, "12345")).toBe(false);
    expect(verifyTotp(s, "abcdef")).toBe(false);
    expect(verifyTotp(s, "")).toBe(false);
  });
  it("accepts codes typed with a space (123 456)", () => {
    const s = generateSecret();
    const c = phoneCode(s, Date.now() / 1000);
    expect(verifyTotp(s, `${c.slice(0, 3)} ${c.slice(3)}`)).toBe(true);
  });
  it("builds a standard otpauth:// link for the QR code", () => {
    const url = otpauthUrl("ABCDEF", "me@x.com", "Grow My Security Company");
    expect(url).toMatch(/^otpauth:\/\/totp\//);
    expect(url).toContain("secret=ABCDEF");
    expect(url).toContain("issuer=Grow%20My%20Security%20Company");
  });
});
