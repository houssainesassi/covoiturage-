"use client";
import { useId, useMemo, useRef, useState } from "react";
import { MapPin, Plane } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { locName } from "@/lib/names";
import { normalize, type LocationLite } from "@/lib/location-lite";
import { cn } from "@/lib/utils";

export function LocationCombobox({
  locations,
  value,
  onChange,
  placeholder,
  id,
  name,
  invalid,
  className,
  inputClassName,
}: {
  locations: LocationLite[];
  value: LocationLite | null;
  onChange: (l: LocationLite | null) => void;
  placeholder: string;
  id?: string;
  name?: string;
  invalid?: boolean;
  className?: string;
  inputClassName?: string;
}) {
  const { locale, d } = useI18n();
  const autoId = useId();
  const listId = `${id ?? autoId}-list`;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = normalize(query);
    const list = q
      ? locations.filter((l) => [l.name_fr, l.name_ar, l.name_en, l.slug].some((n) => normalize(n).includes(q)))
      : locations;
    return list.slice(0, 8);
  }, [query, locations]);

  const select = (l: LocationLite) => {
    onChange(l);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className={cn("relative", className)}>
      {name && <input type="hidden" name={name} value={value?.id ?? ""} />}
      <input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={invalid || undefined}
        autoComplete="off"
        placeholder={placeholder}
        value={open ? query : value ? locName(value, locale) : ""}
        onFocus={() => { setOpen(true); setQuery(""); setActive(0); }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); if (!e.target.value) onChange(null); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && open && results[active]) { e.preventDefault(); select(results[active]); }
          else if (e.key === "Escape") setOpen(false);
        }}
        className={cn(
          "h-12 w-full rounded-xl border border-slate-300 bg-white ps-10 pe-3 text-[15px] text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15 aria-[invalid=true]:border-red-500",
          inputClassName,
        )}
      />
      <MapPin className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-brand-600" aria-hidden />
      {open && (
        <ul id={listId} role="listbox" className="absolute z-40 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-[var(--shadow-lift)]">
          {results.length === 0 ? (
            <li className="px-4 py-3 text-sm text-slate-500">{d.search.noCity}</li>
          ) : (
            results.map((l, i) => {
              const Icon = l.kind === "airport" ? Plane : MapPin;
              return (
                <li
                  key={l.id}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => { e.preventDefault(); select(l); }}
                  onMouseEnter={() => setActive(i)}
                  className={cn("flex cursor-pointer items-center gap-3 px-4 py-2.5", i === active && "bg-brand-50")}
                >
                  <Icon className="size-4 shrink-0 text-slate-400" aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-900">{locName(l, locale)}</span>
                    <span className="block truncate text-xs text-slate-500">{locale === "ar" ? l.name_fr : l.name_ar}</span>
                  </span>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
