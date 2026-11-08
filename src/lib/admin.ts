import "server-only";

export const ADMIN_PAGE_SIZE = 25;

export type SearchParam = string | string[] | undefined;

export const textParam = (v: SearchParam) => (typeof v === "string" ? v.trim().slice(0, 100) : "");
export const pageParam = (v: SearchParam) => Math.max(Math.floor(Number(v)) || 1, 1);
export const oneOf = <T extends string>(v: SearchParam, allowed: readonly T[]): T | null =>
  allowed.includes(v as T) ? (v as T) : null;

/** Value for an ilike filter: the admin's text is matched literally, not as a pattern. */
export const contains = (text: string) => `%${text.replace(/[%_*\\]/g, "")}%`;

export const rangeOf = (page: number, size = ADMIN_PAGE_SIZE) => [(page - 1) * size, page * size - 1] as const;

/** Rows of a list query. Failures reach admin/error.tsx instead of looking like an empty list. */
export function rowsOf<T>({ data, error, count }: { data: T[] | null; error: { message: string; code?: string } | null; count?: number | null }) {
  // PGRST103: the requested page is past the end, e.g. an old link after rows were filtered out.
  if (error && error.code !== "PGRST103") throw new Error(error.message);
  return { rows: data ?? [], total: count ?? 0 };
}
