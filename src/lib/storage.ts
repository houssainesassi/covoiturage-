import { env } from "./env";

/** Public URL of an object in a public Supabase Storage bucket. */
export function publicUrl(bucket: "avatars" | "vehicles", path: string | null | undefined) {
  if (!path) return null;
  return `${env.supabaseUrl}/storage/v1/object/public/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const MAX_VEHICLE_PHOTO_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
