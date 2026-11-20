import { getBranding } from "@/lib/settings";

/** Injects the agency's brand color as a CSS variable. */
export function BrandStyle() {
  const { primaryColor } = getBranding();
  const safe = /^#[0-9a-f]{3,8}$/i.test(primaryColor) ? primaryColor : "#0b4a8b";
  return <style>{`:root{--brand:${safe}}`}</style>;
}

export function BrandMark({ size = "md" }: { size?: "sm" | "md" }) {
  const b = getBranding();
  const h = size === "sm" ? "h-7" : "h-10";
  return b.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={b.logoUrl} alt={b.agencyName} className={`${h} w-auto`} />
  ) : (
    <span className="text-lg font-semibold tracking-tight text-brand">{b.agencyName}</span>
  );
}
