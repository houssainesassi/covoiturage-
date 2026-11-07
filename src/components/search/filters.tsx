"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/lib/i18n/client";
import { Select, Label } from "@/components/ui/form";
import { fmt } from "@/lib/i18n/format";

export function SearchFilters() {
  const { d } = useI18n();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const set = (key: string, value: string) => {
    const p = new URLSearchParams(params);
    if (value) p.set(key, value); else p.delete(key);
    p.delete("page");
    router.push(`${pathname}?${p}`, { scroll: false });
  };
  const hasFilters = ["maxPrice", "time", "rating"].some((k) => params.get(k));
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-1 lg:gap-4">
      <div>
        <Label htmlFor="f-sort">{d.common.sortBy}</Label>
        <Select id="f-sort" value={params.get("sort") ?? "departure"} onChange={(e) => set("sort", e.target.value === "departure" ? "" : e.target.value)}>
          <option value="departure">{d.search.sort.departure}</option>
          <option value="price">{d.search.sort.price}</option>
          <option value="rating">{d.search.sort.rating}</option>
        </Select>
      </div>
      <div>
        <Label htmlFor="f-time">{d.search.departureTime}</Label>
        <Select id="f-time" value={params.get("time") ?? ""} onChange={(e) => set("time", e.target.value)}>
          <option value="">{d.search.timeAny}</option>
          <option value="early">{d.search.timeEarly}</option>
          <option value="morning">{d.search.timeMorning}</option>
          <option value="afternoon">{d.search.timeAfternoon}</option>
          <option value="evening">{d.search.timeEvening}</option>
        </Select>
      </div>
      <div>
        <Label htmlFor="f-price">{d.search.maxPrice}</Label>
        <Select id="f-price" value={params.get("maxPrice") ?? ""} onChange={(e) => set("maxPrice", e.target.value)}>
          <option value="">{d.search.anyPrice}</option>
          {[5, 10, 15, 20, 30, 40, 60].map((p) => <option key={p} value={p}>≤ {p} DT</option>)}
        </Select>
      </div>
      <div>
        <Label htmlFor="f-rating">{d.search.minRating}</Label>
        <Select id="f-rating" value={params.get("rating") ?? ""} onChange={(e) => set("rating", e.target.value)}>
          <option value="">{d.search.anyRating}</option>
          {[3, 4, 4.5].map((r) => <option key={r} value={r}>{fmt(d.search.ratingAtLeast, { n: r })}</option>)}
        </Select>
      </div>
      {hasFilters && (
        <button
          type="button"
          className="col-span-2 justify-self-start text-sm font-semibold text-brand-700 hover:underline lg:col-span-1"
          onClick={() => {
            const p = new URLSearchParams(params);
            ["maxPrice", "time", "rating", "page"].forEach((k) => p.delete(k));
            router.push(`${pathname}?${p}`, { scroll: false });
          }}
        >
          {d.search.clearFilters}
        </button>
      )}
    </div>
  );
}
