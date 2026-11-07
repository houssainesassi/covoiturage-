"use client";
import { useTransition } from "react";
import { Globe } from "lucide-react";
import { setLocaleAction } from "@/actions/locale";
import { useI18n } from "@/lib/i18n/client";
import { localeLabels, locales } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, d } = useI18n();
  const [pending, start] = useTransition();
  return (
    <label className={cn("relative inline-flex items-center", className)}>
      <span className="sr-only">{d.nav.language}</span>
      <Globe className="pointer-events-none absolute start-2.5 size-4 text-slate-500" aria-hidden />
      <select
        value={locale}
        disabled={pending}
        onChange={(e) => start(() => setLocaleAction(e.target.value))}
        className="h-9 cursor-pointer appearance-none rounded-xl border border-slate-200 bg-white ps-8 pe-3 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
      >
        {locales.map((l) => (
          <option key={l} value={l}>{localeLabels[l]}</option>
        ))}
      </select>
    </label>
  );
}
