import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  allPasswords,
  createClient,
  getAnswers,
  getClient,
  getClientByToken,
  listCredentials,
  progress,
  regenerateLink,
  revealPassword,
  saveAnswer,
  setLinkActive,
  submitClient,
  upsertCredential,
} from "@/lib/clients";
import {
  changedFieldMap,
  createChangeRequest,
  isLocked,
  listChangeRequests,
  resolveChangeRequest,
  sectionOfField,
  setLock,
} from "@/lib/locks";
import { createUser, lockedFor, verifyLogin } from "@/lib/auth";
import { formatAnswer, daysSince } from "@/lib/format";
import { isFilled, PROFILE } from "@/lib/forms";

const newClient = (name = "Acme Guards") => createClient({ company: name, contact_name: "Joel R", email: "joel@acme.test", services: ["website", "seo"] }, "admin@test");

describe("clients", () => {
  it("prefills what the admin typed, without marking the client as started", () => {
    const id = newClient();
    const c = getClient(id)!;
    expect(c.status).toBe("not_started");
    expect(getAnswers(id).profile).toMatchObject({ company: "Acme Guards", contact_name: "Joel R", email: "joel@acme.test" });
  });

  it("moves to 'in progress' when the client edits, and 'submitted' on send", () => {
    const id = newClient();
    saveAnswer(id, "profile", "phone", "555-0100", "client");
    expect(getClient(id)!.status).toBe("in_progress");
    submitClient(id);
    const c = getClient(id)!;
    expect(c.status).toBe("submitted");
    expect(c.first_submitted_at).toBeTruthy();
    expect(c.version).toBe(1);
  });

  it("only opens the client page for an active, exact token", () => {
    const id = newClient();
    const { token } = getClient(id)!;
    expect(getClientByToken(token)?.id).toBe(id);
    expect(getClientByToken(token.slice(0, -1))).toBeNull();
    expect(getClientByToken("")).toBeNull();
    setLinkActive(id, false);
    expect(getClientByToken(token)).toBeNull();
    setLinkActive(id, true);
    regenerateLink(id);
    expect(getClientByToken(token)).toBeNull(); // old link dies
    expect(getClientByToken(getClient(id)!.token)?.id).toBe(id);
  });

  it("computes progress and lists missing required items", () => {
    const id = newClient();
    const before = progress(getClient(id)!);
    expect(before.missingRequired).toContain("Phone number");
    expect(before.missingRequired).toContain("Which email should website leads go to?");
    saveAnswer(id, "profile", "phone", "555", "client");
    const after = progress(getClient(id)!);
    expect(after.percent).toBeGreaterThan(before.percent);
    expect(after.missingRequired).not.toContain("Phone number");
  });
});

describe("client logins (passwords)", () => {
  it("stores passwords encrypted and never returns them in lists", () => {
    const id = newClient();
    upsertCredential(id, { platform: "Website hosting", username: "acme", password: "S3cret!Pass" }, "client");
    const raw = db.prepare("SELECT password_enc FROM credentials WHERE client_id = ? AND platform = 'Website hosting'").get(id) as {
      password_enc: string;
    };
    expect(raw.password_enc).not.toContain("S3cret");
    const listed = listCredentials(id).find((c) => c.platform === "Website hosting")!;
    expect(listed).not.toHaveProperty("password_enc");
    expect(JSON.stringify(listed)).not.toContain("S3cret");
    expect(listed.has_password).toBe(true);
  });

  it("keeps the old password when the client saves an empty one", () => {
    const id = newClient();
    upsertCredential(id, { platform: "Facebook", password: "first" }, "client");
    upsertCredential(id, { platform: "Facebook", password: "", username: "fb-user" }, "client");
    const cred = listCredentials(id).find((c) => c.platform === "Facebook")!;
    expect(revealPassword(id, cred.id, "admin@test")).toBe("first");
  });

  it("logs every reveal and won't reveal another client's password", () => {
    const a = newClient("A");
    const b = newClient("B");
    upsertCredential(a, { platform: "Instagram", password: "pw-a" }, "client");
    const credA = listCredentials(a).find((c) => c.platform === "Instagram")!;
    expect(revealPassword(b, credA.id, "admin@test")).toBe(""); // wrong client id
    expect(revealPassword(a, credA.id, "admin@test")).toBe("pw-a");
    const log = db.prepare("SELECT COUNT(*) n FROM activity WHERE client_id = ? AND action = 'revealed password'").get(a) as { n: number };
    expect(log.n).toBe(1);
  });

  it("excludes 'don't have this' accounts from the credentials PDF data", () => {
    const id = newClient();
    upsertCredential(id, { platform: "LinkedIn", username: "x", password: "y" }, "client");
    upsertCredential(id, { platform: "LinkedIn", not_applicable: true }, "client");
    expect(allPasswords(id).map((r) => r.platform)).not.toContain("LinkedIn");
  });
});

describe("locking, change requests and change history", () => {
  it("maps fields to sections", () => {
    expect(sectionOfField("profile", "phone")).toBe("contact");
    expect(sectionOfField("profile", "logo")).toBe("brand");
  });

  it("approving a change request unlocks the section", () => {
    const id = newClient();
    setLock(id, "profile", "contact", true, "admin@test");
    expect(isLocked(id, "profile", "contact")).toBe(true);
    const crId = createChangeRequest(id, "profile", "contact", "New phone");
    expect(listChangeRequests(id)[0].status).toBe("pending");
    resolveChangeRequest(crId, true, "", "admin@test");
    expect(isLocked(id, "profile", "contact")).toBe(false);
    expect(resolveChangeRequest(crId, false, "", "admin@test")).toBeNull(); // can't resolve twice
  });

  it("declining keeps the section locked", () => {
    const id = newClient();
    setLock(id, "profile", "contact", true, "admin@test");
    const crId = createChangeRequest(id, "profile", "contact", "Change");
    resolveChangeRequest(crId, false, "Already printed", "admin@test");
    expect(isLocked(id, "profile", "contact")).toBe(true);
    expect(listChangeRequests(id)[0]).toMatchObject({ status: "declined", admin_note: "Already printed" });
  });

  it("shows the value the team originally received as 'Was:' (regression)", () => {
    const id = newClient();
    saveAnswer(id, "profile", "phone", "347-661-2801", "client");
    // force the submission timestamp to be strictly later than the first edit
    db.prepare("UPDATE answer_history SET created_at = datetime('now', '-1 minute') WHERE client_id = ?").run(id);
    submitClient(id);
    db.prepare("UPDATE clients SET first_submitted_at = datetime('now', '-30 seconds') WHERE id = ?").run(id);
    saveAnswer(id, "profile", "phone", "347-555-0199", "client");
    const change = changedFieldMap(id, getClient(id)!.first_submitted_at).get("profile.phone");
    expect(change?.from).toBe("347-661-2801");
  });

  it("does not record history for system prefill or unchanged values", () => {
    const id = newClient();
    const n = () => (db.prepare("SELECT COUNT(*) n FROM answer_history WHERE client_id = ?").get(id) as { n: number }).n;
    expect(n()).toBe(0);
    saveAnswer(id, "profile", "phone", "1", "client");
    saveAnswer(id, "profile", "phone", "1", "client");
    expect(n()).toBe(1);
  });
});

describe("admin login protection", () => {
  it("logs in with the right password only", async () => {
    await createUser("boss@test.local", "Boss", "correct-horse-1", "admin");
    expect(await verifyLogin("boss@test.local", "correct-horse-1")).toMatchObject({ email: "boss@test.local" });
    expect(await verifyLogin("BOSS@test.local ", "correct-horse-1")).not.toBeNull(); // case/space-insensitive email
    expect(await verifyLogin("boss@test.local", "wrong")).toBeNull();
    expect(await verifyLogin("nobody@test.local", "x")).toBeNull();
  });

  it("locks an email after 5 wrong passwords", async () => {
    await createUser("lock@test.local", "Lock", "right-password-1", "admin");
    for (let i = 0; i < 5; i++) await verifyLogin("lock@test.local", "nope");
    expect(lockedFor("lock@test.local")).toBeGreaterThan(0);
  });

  it("stores bcrypt hashes, never plain passwords", async () => {
    await createUser("hash@test.local", "Hash", "plain-text-pw-1", "admin");
    const row = db.prepare("SELECT password_hash FROM users WHERE email = 'hash@test.local'").get() as { password_hash: string };
    expect(row.password_hash).toMatch(/^\$2[aby]\$12\$/);
    expect(row.password_hash).not.toContain("plain-text");
  });
});

describe("helpers", () => {
  it("knows what counts as answered", () => {
    expect(isFilled("")).toBe(false);
    expect(isFilled("  ")).toBe(false);
    expect(isFilled([{}])).toBe(false);
    expect(isFilled([{ name: " " }])).toBe(false);
    expect(isFilled([{ name: "Allied" }])).toBe(true);
    expect(isFilled(["Home"])).toBe(true);
  });
  it("formats repeaters as bullet lines", () => {
    const f = PROFILE.sections[1].fields.find((x) => x.key === "competitors")!;
    expect(formatAnswer(f, [{ name: "Allied", url: "allied.com" }, { name: "", url: "" }])).toBe("• Allied | allied.com");
  });
  it("reads SQLite UTC timestamps correctly", () => {
    const d = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 19).replace("T", " ");
    expect(Math.round(daysSince(d))).toBe(2);
    expect(daysSince(null)).toBe(Infinity);
  });
});
