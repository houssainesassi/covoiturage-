import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-slate-200/70", className)} />;
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-[var(--radius-card)] border border-dashed border-slate-300 bg-white/60 px-6 py-12 text-center">
      {icon && <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">{icon}</div>}
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {body && <p className="mt-1 max-w-md text-sm text-slate-500">{body}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function Stars({ value, size = 14, className }: { value: number; size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-label={`${value.toFixed(1)}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} style={{ width: size, height: size }} className={i <= Math.round(value) ? "fill-amber-400 text-amber-400" : "fill-slate-200 text-slate-200"} aria-hidden />
      ))}
    </span>
  );
}

export function Tabs({ tabs, active }: { tabs: { key: string; label: ReactNode; href: string; count?: number }[]; active: string }) {
  return (
    <nav className="mb-5 flex gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1" aria-label="Tabs">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? "page" : undefined}
          className={cn(
            "flex-1 whitespace-nowrap rounded-xl px-4 py-2 text-center text-sm font-semibold transition",
            t.key === active ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
          )}
        >
          {t.label}
          {t.count ? <span className="ms-1.5 rounded-full bg-accent-500 px-1.5 text-xs text-white">{t.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

export function Pagination({ page, totalPages, hrefFor, labels }: { page: number; totalPages: number; hrefFor: (p: number) => string; labels: { previous: string; next: string; pageOf: string } }) {
  if (totalPages <= 1) return null;
  return (
    <nav className="mt-6 flex items-center justify-between gap-3" aria-label="Pagination">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50">
          <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden /> {labels.previous}
        </Link>
      ) : <span />}
      <span className="text-sm text-slate-500">{labels.pageOf}</span>
      {page < totalPages ? (
        <Link href={hrefFor(page + 1)} className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50">
          {labels.next} <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
        </Link>
      ) : <span />}
    </nav>
  );
}

export function StatCard({ label, value, icon, tone = "brand", href, highlight }: { label: ReactNode; value: ReactNode; icon?: ReactNode; tone?: "brand" | "accent" | "slate"; href?: string; highlight?: boolean }) {
  const t = tone === "accent" ? "bg-accent-50 text-accent-600" : tone === "slate" ? "bg-slate-100 text-slate-600" : "bg-brand-50 text-brand-600";
  const body = (
    <div className="flex items-center gap-3">
      {icon && <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", t)}>{icon}</span>}
      <div className="min-w-0">
        <p className="text-xl font-extrabold tabular-nums text-slate-900 sm:text-2xl">{value}</p>
        <p className="line-clamp-2 text-xs font-medium leading-snug text-slate-500 sm:text-sm">{label}</p>
      </div>
    </div>
  );
  const cls = cn(
    "block rounded-[var(--radius-card)] border bg-white p-4 shadow-[var(--shadow-card)] sm:p-5",
    highlight ? "border-accent-300 ring-2 ring-accent-100" : "border-slate-200/80",
    href && "transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-[var(--shadow-lift)]",
  );
  return href ? <Link href={href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}
