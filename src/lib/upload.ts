"use client";
import { createClient } from "@/lib/supabase/client";
import { ALLOWED_IMAGE_TYPES } from "@/lib/storage";
import type { ErrorCode } from "@/lib/errors";

/** Uploads an image into `<bucket>/<userId>/…`; storage RLS enforces the folder. */
export async function uploadImage(bucket: "avatars" | "vehicles" | "rentals", userId: string, file: File, maxBytes: number): Promise<{ path: string } | { error: ErrorCode }> {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return { error: "invalid_file_type" };
  if (file.size > maxBytes) return { error: "file_too_large" };
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await createClient().storage.from(bucket).upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
  return error ? { error: "upload_failed" } : { path };
}
