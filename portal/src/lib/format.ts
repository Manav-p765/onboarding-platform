import type { Field } from "./forms";

/** Human-readable text for an answer (used in admin view and PDFs). */
export function formatAnswer(field: Field, value: unknown): string {
  if (value == null || value === "") return "";
  switch (field.type) {
    case "checkboxes":
    case "colors":
      return Array.isArray(value) ? value.filter(Boolean).join(", ") : String(value);
    case "repeater":
      if (!Array.isArray(value)) return "";
      return value
        .map((row: Record<string, string>) =>
          (field.columns ?? [])
            .map((c) => (row?.[c.key] ?? "").trim())
            .filter(Boolean)
            .join(" | "),
        )
        .filter(Boolean)
        .map((line) => `• ${line}`)
        .join("\n");
    default:
      return String(value);
  }
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

/** Days since a SQLite UTC timestamp (or ISO string). */
export function daysSince(s: string | null): number {
  if (!s) return Infinity;
  return (Date.now() - new Date(s.includes("T") ? s : s.replace(" ", "T") + "Z").getTime()) / 864e5;
}

/** SQLite datetime('now') is UTC without a zone marker. */
export function fmtDate(s: string | null) {
  if (!s) return "";
  return new Date(s.includes("T") ? s : s.replace(" ", "T") + "Z").toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
