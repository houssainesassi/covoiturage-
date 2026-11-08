import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Kpi({ href, label, value, hint, icon }: { href?: string; label: string; value: string; hint?: string; icon: ReactNode }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-sm font-medium text-slate-500">{label}</p>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">{icon}</span>
      </div>
      <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums sm:text-3xl">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </>
  );
  const box = "block rounded-2xl border border-slate-200 bg-white p-4 shadow-[var(--shadow-card)] sm:p-5";
  return href ? <Link href={href} className={cn(box, "transition hover:border-brand-300 hover:shadow-[var(--shadow-lift)]")}>{body}</Link> : <div className={box}>{body}</div>;
}

const attentionTones = {
  danger: "border-red-200 bg-red-50 text-red-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  neutral: "border-slate-200 bg-white text-slate-700",
};

/** A count that leads to the list where it can be acted on. Calm once there is nothing to do. */
export function AttentionCard({ href, count, value, label, icon, tone }: { href: string; count: number; value: string; label: string; icon: ReactNode; tone: "danger" | "warning" }) {
  return (
    <Link href={href} className={cn("flex items-center gap-3 rounded-2xl border p-3.5 transition hover:shadow-[var(--shadow-card)]", attentionTones[count ? tone : "neutral"])}>
      <span className="shrink-0" aria-hidden>{icon}</span>
      <span className="text-xl font-bold tabular-nums">{value}</span>
      <span className="min-w-0 text-sm leading-snug">{label}</span>
    </Link>
  );
}

export type Day = { day: string; signups: number; trips: number; bookings: number };

/** One small chart per measure, all on the same scale so their heights can be compared. */
export function ActivityPanel({ title, total, days, dataKey, max, maxLabel, tooltip, startLabel, endLabel }: { title: string; total: string; days: Day[]; dataKey: "signups" | "trips" | "bookings"; max: number; maxLabel: string; tooltip: (d: Day) => string; startLabel: string; endLabel: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        <span className="text-lg font-bold text-slate-900 tabular-nums">{total}</span>
      </div>
      <div className="relative mt-2 flex h-28 items-end gap-0.5 border-b border-slate-300 border-t border-t-slate-100" aria-hidden>
        <span className="absolute start-0 top-0 z-[1] rounded-b bg-white/85 px-1 text-[10px] leading-4 text-slate-400 tabular-nums">{maxLabel}</span>
        {days.map((day, i) => (
          <div key={day.day} className="group relative flex h-full min-w-0 flex-1 items-end hover:bg-slate-100">
            <div className="w-full rounded-t bg-brand-500 group-hover:bg-brand-700" style={{ height: `${(day[dataKey] / max) * 100}%`, minHeight: day[dataKey] ? 3 : 0 }} />
            <span className={cn("pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-xs text-white shadow-lg group-hover:block", i < 8 ? "start-0" : i > 21 ? "end-0" : "start-1/2 -translate-x-1/2 rtl:translate-x-1/2")}>{tooltip(day)}</span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-slate-400" aria-hidden><span>{startLabel}</span><span>{endLabel}</span></div>
    </div>
  );
}

export type Part = { label: string; value: number; display: string; color: string };

export function Breakdown({ title, total, parts }: { title: string; total: number; parts: Part[] }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-slate-700">{title}</h3>
      <ul className="space-y-2.5">
        {parts.map((p) => (
          <li key={p.label} className="text-sm">
            <div className="flex justify-between gap-2"><span className="text-slate-600">{p.label}</span><span className="font-semibold text-slate-900 tabular-nums">{p.display}</span></div>
            <div className="mt-1 h-1.5 rounded-full bg-slate-100" aria-hidden><div className={cn("h-full rounded-full", p.color)} style={{ width: `${total ? (p.value / total) * 100 : 0}%` }} /></div>
          </li>
        ))}
      </ul>
    </div>
  );
}
