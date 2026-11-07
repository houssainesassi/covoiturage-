import type { Locale } from "../config";
import ar from "./ar";
import en, { type Dictionary } from "./en";
import fr from "./fr";

const dictionaries: Record<Locale, Dictionary> = { ar, en, fr };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
export type { Dictionary };
