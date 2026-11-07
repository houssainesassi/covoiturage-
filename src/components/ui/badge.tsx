import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";
const tones: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  brand: "bg-brand-50 text-brand-800 ring-brand-200",
  success: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  danger: "bg-red-50 text-red-700 ring-red-200",
  info: "bg-sky-50 text-sky-800 ring-sky-200",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset", tones[tone], className)}>
      {children}
    </span>
  );
}

export const bookingTone: Record<string, Tone> = {
  pending: "warning",
  confirmed: "success",
  rejected: "danger",
  cancelled: "neutral",
  completed: "info",
};
export const tripTone: Record<string, Tone> = { scheduled: "brand", cancelled: "danger", completed: "info", departed: "neutral" };

/** Marks fictional demo/example records wherever they are displayed. */
export function DemoBadge({ label, className }: { label: string; className?: string }) {
  return <Badge tone="warning" className={cn("uppercase tracking-wide", className)}>{label}</Badge>;
}
