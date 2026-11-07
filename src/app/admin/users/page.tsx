import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmt, formatDate } from "@/lib/i18n/format";
import { formatTunisianPhone } from "@/lib/phone";
import { PageHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Pagination } from "@/components/ui/misc";
import { FilterBar, Table } from "@/components/admin/table";
import { UserActions } from "@/components/admin/admin-actions";

const PAGE = 25;

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const status = sp.status === "active" || sp.status === "suspended" ? sp.status : null;
  const role = sp.role === "admin" || sp.role === "user" ? sp.role : null;
  const page = Math.max(Number(sp.page) || 1, 1);
  const { d, locale } = await getI18n();
  const me = await getUser();
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_list_users", { p_search: q || null, p_status: status, p_role: role, p_limit: PAGE, p_offset: (page - 1) * PAGE });
  const rows = data ?? [];
  const totalPages = Math.ceil(Number(rows[0]?.total_count ?? 0) / PAGE);
  const href = (p: number) => `/admin/users?${new URLSearchParams({ ...(q && { q }), ...(status && { status }), ...(role && { role }), page: String(p) })}`;
  return (
    <div>
      <PageHeader title={d.admin.users} />
      <FilterBar>
        <Input name="q" defaultValue={q} placeholder={d.admin.searchUsers} className="max-w-xs" aria-label={d.admin.searchUsers} />
        <Select name="status" defaultValue={status ?? ""} className="w-auto" aria-label={d.common.status}><option value="">{d.admin.allStatuses}</option><option value="active">{d.admin.active}</option><option value="suspended">{d.admin.suspended}</option></Select>
        <Select name="role" defaultValue={role ?? ""} className="w-auto" aria-label="role"><option value="">{d.admin.allRoles}</option><option value="user">{d.admin.roleUser}</option><option value="admin">{d.admin.roleAdmin}</option></Select>
        <Button type="submit" variant="outline">{d.common.search}</Button>
      </FilterBar>
      <Table head={[d.admin.user, d.admin.phone, d.common.status, d.admin.activityCol, d.admin.joined, d.common.actions]} empty={!rows.length && <p className="p-6 text-center text-sm text-slate-500">{d.admin.empty}</p>}>
        {rows.map((u) => (
          <tr key={u.id} className="align-top">
            <td className="px-4 py-3">
              <Link href={`/users/${u.id}`} className="flex items-center gap-3">
                <Avatar path={u.avatar_path} name={u.full_name} size="sm" />
                <span className="min-w-0"><span className="block font-semibold">{u.full_name || "—"}</span><span className="block text-xs text-slate-500" dir="ltr">{u.email ?? "—"}</span></span>
              </Link>
            </td>
            <td className="px-4 py-3 text-slate-600" dir="ltr">{formatTunisianPhone(u.phone) || "—"}</td>
            <td className="px-4 py-3">
              <div className="flex flex-wrap gap-1">
                <Badge tone={u.status === "active" ? "success" : "danger"}>{u.status === "active" ? d.admin.active : d.admin.suspended}</Badge>
                {u.role === "admin" && <Badge tone="info">{d.admin.roleAdmin}</Badge>}
                {u.is_demo && <DemoBadge label={d.common.demo} />}
              </div>
              {u.suspended_reason && <p className="mt-1 text-xs text-slate-500">{u.suspended_reason}</p>}
            </td>
            <td className="px-4 py-3 text-xs text-slate-600">{d.admin.trips}: {u.trips_count} · {d.admin.bookings}: {u.bookings_count}<br />{d.admin.reports}: {u.reports_count} · ★ {Number(u.rating_avg).toFixed(1)}</td>
            <td className="px-4 py-3 text-xs text-slate-500">{formatDate(u.created_at, locale, "short")}{u.last_sign_in_at && <><br />{d.admin.lastSignIn}: {formatDate(u.last_sign_in_at, locale, "short")}</>}</td>
            <td className="px-4 py-3">{!u.is_demo && <UserActions id={u.id} name={u.full_name} status={u.status} role={u.role} self={u.id === me?.id} />}</td>
          </tr>
        ))}
      </Table>
      <Pagination page={page} totalPages={totalPages} hrefFor={href} labels={{ previous: d.common.previous, next: d.common.next, pageOf: fmt(d.common.pageOf, { page, total: totalPages }) }} />
    </div>
  );
}
