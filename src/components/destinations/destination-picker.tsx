"use client";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/client";
import type { LocationLite } from "@/lib/location-lite";
import { LocationCombobox } from "@/components/search/location-combobox";

/** "Another destination": picking a town opens its destination page. */
export function DestinationPicker({ locations }: { locations: LocationLite[] }) {
  const { d } = useI18n();
  const router = useRouter();
  return (
    <LocationCombobox
      id="other-destination"
      locations={locations}
      value={null}
      onChange={(l) => l && router.push(`/destinations/${l.slug}`)}
      placeholder={d.dest.otherPlaceholder}
      inputClassName="h-13 bg-white text-base"
    />
  );
}
