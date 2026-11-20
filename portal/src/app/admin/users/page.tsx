import { connection } from "next/server";
import { listUsers, requireUser } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { Initials } from "@/components/StatusBadge";
import { AddUserForm, UserRowActions } from "./UserControls";

export default async function UsersPage() {
  await connection();
  const me = await requireUser();
  const users = listUsers();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold">Team logins</h1>
        <p className="mt-1 text-muted">People who can open this admin area. Clients never need a login; they use their private link.</p>
      </div>

      <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
        {users.map((u) => {
          const manageable = u.id !== me.id && (me.role === "super" || u.role === "admin");
          return (
            <li key={u.id} className="grid gap-3 border-b border-line px-5 py-4 last:border-0 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="flex min-w-0 items-center gap-3.5">
                <Initials name={u.name} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{u.name}</span>
                    {u.id === me.id && <span className="text-sm text-faint">(you)</span>}
                    <span className={`badge ${u.role === "super" ? "bg-text text-white" : "bg-sunken text-muted ring-1 ring-line"}`}>
                      {u.role === "super" ? "Super Admin" : "Admin"}
                    </span>
                    {u.totp_enabled ? (
                      <span className="badge bg-ok/10 text-ok ring-1 ring-ok/25">2-step on</span>
                    ) : (
                      <span className="badge bg-attn/12 text-[#8a5d00] ring-1 ring-attn/30">2-step off</span>
                    )}
                    {!!u.must_change_password && <span className="badge bg-sunken text-muted ring-1 ring-line">Temporary password</span>}
                  </div>
                  <div className="truncate text-sm text-muted">{u.email} · added {fmtDate(u.created_at)}</div>
                </div>
              </div>
              {manageable && <UserRowActions id={u.id} email={u.email} has2fa={!!u.totp_enabled} />}
            </li>
          );
        })}
      </ul>

      <AddUserForm canMakeSuper={me.role === "super"} />
    </div>
  );
}
