import { env } from "./env";

export const site = {
  name: "Waselni Fahs",
  nameAr: "وصّلني الفحص",
  /** Home region of the platform; drives the homepage hero, defaults & map centre. */
  homeCitySlug: env.homeCitySlug,
  homeGovernorate: "zaghouan",
  /** El Fahs town centre, used before locations load. */
  defaultCenter: { lat: 36.3744, lng: 9.9064 },
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "",
};

export function absoluteUrl(path: string, origin?: string) {
  const base = env.siteUrl || origin || "http://localhost:3000";
  return new URL(path, base).toString();
}
