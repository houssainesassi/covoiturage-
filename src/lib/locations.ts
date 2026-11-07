import "server-only";
import { cache } from "react";
import { createClient } from "./supabase/server";
import type { Governorate, Location } from "./supabase/database.types";

export const getLocations = cache(async (): Promise<Location[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("locations").select("*").order("popularity", { ascending: false }).order("name_fr");
  return data ?? [];
});

export const getGovernorates = cache(async (): Promise<Governorate[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("governorates").select("*").order("name_fr");
  return data ?? [];
});

export async function getLocationMap() {
  const list = await getLocations();
  return new Map(list.map((l) => [l.id, l]));
}
