import { Star, Users } from "lucide-react";
import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
import { getUser, requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatNumber } from "@/lib/i18n/format";
import { formatTunisianPhone } from "@/lib/phone";
import { ADMIN_PAGE_SIZE, oneOf, pageParam, rowsOf, textParam } from "@/lib/admin";
import { PageHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { DataTable, FilterBar, ListEmpty, listHref, RowActions, SearchField, TablePager, Td, ViewLink } from "@/components/admin/table";
import { FilterSelect } from "@/components/admin/filter-select";
import { UserActions } from "@/components/admin/admin-actions";

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  await requireAdmin(); // pages render in parallel with the layout guard
  const sp = await searchParams;
  const q = textParam(sp.q);
  const status = oneOf(sp.status, ["active", "suspended"] as const);
  const role = oneOf(sp.role, ["user", "admin"] as const);
  const page = pageParam(sp.page);
  const { d, locale } = await getI18n();
  const me = await getUser();
  const supabase = await createClient();
  const { rows } = rowsOf(await supabase.rpc("admin_list_users", { p_search: q || null, p_status: status, p_role: role, p_limit: ADMIN_PAGE_SIZE, p_offset: (page - 1) * ADMIN_PAGE_SIZE }));
  const total = Number(rows[0]?.total_count ?? 0);
  const filtered = Boolean(q || status || role);
  const c = { user: d.admin.user, phone: d.admin.phone, status: d.common.status, activity: d.admin.activityCol, joined: d.admin.joined };
  return (
    <div>
      <PageHeader title={d.admin.users} description={d.admin.usersSubtitle} />
      <FilterBar action="/admin/users" active={filtered}>
        <SearchField value={q} placeholder={d.admin.searchUsers} />
        <FilterSelect name="status" defaultValue={status ?? ""} aria-label={d.common.status}>
          <option value="">{d.admin.allStatuses}</option>
          <option value="active">{d.admin.active}</option>
          <option value="suspended">{d.admin.suspended}</option>
        </FilterSelect>
        <FilterSelect name="role" defaultValue={role ?? ""} aria-label={d.admin.role}>
          <option value="">{d.admin.allRoles}</option>
          <option value="user">{d.admin.roleUser}</option>
          <option value="admin">{d.admin.roleAdmin}</option>
        </FilterSelect>
      </FilterBar>
      {!rows.length ? <ListEmpty filtered={filtered || page > 1} clearHref="/admin/users" icon={<Users className="size-6" aria-hidden />} /> : (
        <DataTable head={[c.user, c.phone, c.status, c.activity, c.joined, d.common.actions]}>
          {rows.map((u) => {
            const self = u.id === me?.id;
            return (
              <tr key={u.id}>
                <Td primary>
                  <Link href={`/users/${u.id}`} className="flex min-w-0 items-center gap-3 hover:text-brand-700">
                    <Avatar path={u.avatar_path} name={u.full_name} size="sm" />
                    <span className="min-w-0">
                      <bdi className="block font-semibold wrap-anywhere">{u.full_name || "—"}</bdi>
                      <span className="block text-xs text-slate-500 wrap-anywhere"><bdi dir="ltr">{u.email ?? "—"}</bdi></span>
                    </span>
                  </Link>
                </Td>
                <Td label={c.phone} className="whitespace-nowrap text-slate-600"><bdi dir="ltr">{formatTunisianPhone(u.phone) || "—"}</bdi></Td>
                <Td label={c.status}>
                  <div>
                    <div className="flex flex-wrap gap-1">
                      <Badge tone={u.status === "active" ? "success" : "danger"}>{u.status === "active" ? d.admin.active : d.admin.suspended}</Badge>
                      {u.role === "admin" && <Badge tone="info">{d.admin.roleAdmin}</Badge>}
                      {self && <Badge tone="brand">{d.admin.you}</Badge>}
                      {u.is_demo && <DemoBadge label={d.common.demo} />}
                    </div>
                    {u.suspended_reason && <p dir="auto" className="mt-1 text-start text-xs text-slate-500 wrap-anywhere">{u.suspended_reason}</p>}
                  </div>
                </Td>
                <Td label={c.activity} className="text-xs text-slate-600">
                  <div className="grid w-fit grid-cols-[auto_auto_auto_auto] gap-x-2 gap-y-0.5 tabular-nums">
                    <span className="text-slate-500">{d.admin.trips}</span><span className="font-semibold">{formatNumber(Number(u.trips_count), locale)}</span>
                    <span className="text-slate-500">{d.admin.bookings}</span><span className="font-semibold">{formatNumber(Number(u.bookings_count), locale)}</span>
                    <span className="text-slate-500">{d.admin.reports}</span><span className={Number(u.reports_count) > 0 ? "font-bold text-red-700" : "font-semibold"}>{formatNumber(Number(u.reports_count), locale)}</span>
                    <Star className="size-3.5 fill-amber-400 text-amber-400" aria-label={d.reviews.rating} /><span className="font-semibold">{Number(u.rating_avg).toFixed(1)}</span>
                  </div>
                </Td>
                <Td label={c.joined} className="whitespace-nowrap text-xs text-slate-500">
                  <div>
                    {formatDate(u.created_at, locale, "short")}
                    {u.last_sign_in_at && <p className="mt-0.5">{d.admin.lastSignIn}: {formatDate(u.last_sign_in_at, locale, "short")}</p>}
                  </div>
                </Td>
                <Td actions>
                  <RowActions>
                    <ViewLink href={`/users/${u.id}`} label={d.common.view} />
                    {!u.is_demo && <UserActions id={u.id} name={u.full_name} status={u.status} role={u.role} self={self} />}
                  </RowActions>
                </Td>
              </tr>
            );
          })}
        </DataTable>
      )}
      <TablePager page={page} total={total} hrefFor={(p) => listHref("/admin/users", { q, status, role, page: p })} />
    </div>
  );
}
