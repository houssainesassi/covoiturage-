"use server";
import { revalidatePath } from "next/cache";
import { fail, type ActionResult } from "@/lib/errors";
import { uuidSchema } from "@/lib/validation";
import type { Enums } from "@/lib/supabase/database.types";
import { authed, result } from "./_util";

// Every admin RPC re-checks is_admin() inside Postgres; these wrappers only validate input.
const valid = (...ids: string[]) => ids.every((id) => uuidSchema.safeParse(id).success);
const note = (s?: string) => s?.trim().slice(0, 500) || null;

export async function adminSetUserStatusAction(userId: string, status: Enums<"account_status">, reason?: string): Promise<ActionResult> {
  if (!valid(userId) || !["active", "suspended"].includes(status)) return fail("validation");
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { error } = await ctx.supabase.rpc("admin_set_user_status", { p_user_id: userId, p_status: status, p_reason: note(reason) });
  revalidatePath("/admin", "layout");
  return result(error);
}

export async function adminSetUserRoleAction(userId: string, role: Enums<"user_role">): Promise<ActionResult> {
  if (!valid(userId) || !["user", "admin"].includes(role)) return fail("validation");
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { error } = await ctx.supabase.rpc("admin_set_user_role", { p_user_id: userId, p_role: role });
  revalidatePath("/admin", "layout");
  return result(error);
}

export async function adminUpdateReportAction(reportId: string, status: Enums<"report_status">, adminNote?: string): Promise<ActionResult> {
  if (!valid(reportId) || !["open", "in_review", "resolved", "dismissed"].includes(status)) return fail("validation");
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { error } = await ctx.supabase.rpc("admin_update_report", { p_report_id: reportId, p_status: status, p_note: note(adminNote) });
  revalidatePath("/admin", "layout");
  return result(error);
}

export async function adminSetReviewHiddenAction(reviewId: string, hidden: boolean): Promise<ActionResult> {
  if (!valid(reviewId)) return fail("validation");
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { error } = await ctx.supabase.rpc("admin_set_review_hidden", { p_review_id: reviewId, p_hidden: hidden });
  revalidatePath("/admin", "layout");
  return result(error);
}

export async function adminSetMessageHiddenAction(messageId: string, hidden: boolean): Promise<ActionResult> {
  if (!valid(messageId)) return fail("validation");
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { error } = await ctx.supabase.rpc("admin_set_message_hidden", { p_message_id: messageId, p_hidden: hidden });
  revalidatePath("/admin", "layout");
  return result(error);
}

export async function adminCancelTripAction(tripId: string, reason?: string): Promise<ActionResult> {
  if (!valid(tripId)) return fail("validation");
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { error } = await ctx.supabase.rpc("cancel_trip", { p_trip_id: tripId, p_reason: note(reason) });
  revalidatePath("/admin", "layout");
  return result(error);
}

export async function adminCancelBookingAction(bookingId: string, reason?: string): Promise<ActionResult> {
  if (!valid(bookingId)) return fail("validation");
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { error } = await ctx.supabase.rpc("cancel_booking", { p_booking_id: bookingId, p_reason: note(reason) });
  revalidatePath("/admin", "layout");
  return result(error);
}
