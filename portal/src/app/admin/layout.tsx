import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getBranding } from "@/lib/settings";
import { BrandStyle } from "@/components/BrandStyle";
import { NavLink } from "@/components/NavLink";
import { logout } from "../login/actions";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const b = getBranding();
  return (
    <div className="min-h-screen">
      <BrandStyle />
      <header className="bg-text text-white">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/admin" className="flex items-center gap-2.5 py-3.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-brand font-display text-sm font-extrabold">
              {b.agencyName.slice(0, 1).toUpperCase()}
            </span>
            <span className="font-display font-bold">{b.agencyName}</span>
            <span className="hidden text-sm text-white/50 sm:inline">Onboarding</span>
          </Link>
          <nav className="flex gap-1 self-stretch text-[15px]">
            <NavLink href="/admin" exact>Clients</NavLink>
            <NavLink href="/admin/users">Team</NavLink>
            <NavLink href="/admin/settings">Settings</NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <Link href="/admin/account" className="hidden text-white/70 hover:text-white sm:inline">{user.name}</Link>
            <form action={logout}>
              <button className="rounded-lg px-3 py-1.5 text-white/80 ring-1 ring-white/20 hover:bg-white/10 hover:text-white">Log out</button>
            </form>
          </div>
        </div>
      </header>
      {!!user.must_change_password && (
        <div className="bg-attn/15 text-[15px]">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-6">
            <span>You&apos;re using a temporary password. Please set your own.</span>
            <Link href="/admin/account" className="font-semibold text-text underline underline-offset-2">Set password</Link>
          </div>
        </div>
      )}
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
