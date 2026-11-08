import Form from "next/form";
import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, SearchX, Search } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { fmt, formatNumber } from "@/lib/i18n/format";
import { ADMIN_PAGE_SIZE } from "@/lib/admin";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonClass, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { Input } from "@/components/ui/form";

export function DataTable({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="wf-table-wrap overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[var(--shadow-card)]">
      <table className="wf-table">
        <thead><tr>{head.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** `label` titles the value when the row is displayed as a card. */
export function Td({ label, primary, actions, className, children }: { label?: string; primary?: boolean; actions?: boolean; className?: string; children: ReactNode }) {
  return <td data-label={label} data-primary={primary || undefined} data-actions={actions || undefined} className={className}>{children}</td>;
}

export function RowActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-1.5">{children}</div>;
}

export function ViewLink({ href, label }: { href: string; label: string }) {
  return <ButtonLink href={href} variant="outline" size="xs">{label}</ButtonLink>;
}

/** A member's name: `<bdi>` keeps Arabic and Latin names correct in either interface direction. */
export function Person({ id, name, avatar }: { id: string; name: string; avatar?: string | null }) {
  return (
    <Link href={`/users/${id}`} className="inline-flex min-w-0 items-center gap-2 hover:text-brand-700">
      <Avatar path={avatar} name={name} size="xs" />
      <bdi className="wrap-anywhere">{name || "—"}</bdi>
    </Link>
  );
}

export async function FilterBar({ action, active, clearHref = action, children }: { action: string; active: boolean; clearHref?: string; children: ReactNode }) {
  const { d } = await getI18n();
  return (
    <Form action={action} className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3">
      {children}
      {active && <Link href={clearHref} className={buttonClass("ghost", "sm", "text-slate-500")}>{d.admin.clearFilters}</Link>}
    </Form>
  );
}

export async function SearchField({ value, placeholder }: { value: string; placeholder: string }) {
  const { d } = await getI18n();
  return (
    <div className="flex w-full min-w-0 gap-2 sm:w-auto sm:min-w-64 sm:flex-1">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <Input name="q" type="search" dir="auto" defaultValue={value} placeholder={placeholder} aria-label={placeholder} className="h-11! ps-9 text-sm! rtl:text-right" />
      </div>
      <Button type="submit" variant="outline" className="h-11">{d.common.search}</Button>
    </div>
  );
}

export async function ListEmpty({ filtered, clearHref, icon }: { filtered: boolean; clearHref: string; icon: ReactNode }) {
  const { d } = await getI18n();
  return filtered ? (
    <EmptyState icon={<SearchX className="size-6" aria-hidden />} title={d.admin.noResults} body={d.admin.noResultsHint} action={<ButtonLink href={clearHref} variant="outline" size="sm">{d.admin.clearFilters}</ButtonLink>} />
  ) : (
    <EmptyState icon={icon} title={d.admin.empty} body={d.admin.emptyHint} />
  );
}

export async function TablePager({ page, total, hrefFor, size = ADMIN_PAGE_SIZE }: { page: number; total: number; hrefFor: (page: number) => string; size?: number }) {
  const { d, locale } = await getI18n();
  if (!total || (page - 1) * size >= total) return null;
  const totalPages = Math.ceil(total / size);
  const button = buttonClass("outline", "xs");
  return (
    <nav aria-label={d.admin.pagination} className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-slate-500 tabular-nums">
        {fmt(d.admin.showing, { from: formatNumber((page - 1) * size + 1, locale), to: formatNumber(Math.min(page * size, total), locale), total: formatNumber(total, locale) })}
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          {page > 1 ? <Link href={hrefFor(page - 1)} className={button}><ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />{d.common.previous}</Link> : <span className={`${button} pointer-events-none opacity-40`} aria-hidden><ChevronLeft className="size-4 rtl:rotate-180" />{d.common.previous}</span>}
          <span className="hidden text-sm text-slate-500 tabular-nums sm:inline">{fmt(d.common.pageOf, { page: formatNumber(page, locale), total: formatNumber(totalPages, locale) })}</span>
          {page < totalPages ? <Link href={hrefFor(page + 1)} className={button}>{d.common.next}<ChevronRight className="size-4 rtl:rotate-180" aria-hidden /></Link> : <span className={`${button} pointer-events-none opacity-40`} aria-hidden>{d.common.next}<ChevronRight className="size-4 rtl:rotate-180" /></span>}
        </div>
      )}
    </nav>
  );
}

/** Builds a list URL, leaving out empty values so links stay short. */
export function listHref(base: string, params: Record<string, string | number | null | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, String(v));
  return q.size ? `${base}?${q}` : base;
}
