"use server";
import { fail, toErrorCode, type ActionResult } from "@/lib/errors";
import { reportSchema } from "@/lib/validation";
import { authed } from "./_util";

export async function reportAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const parsed = reportSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("validation");
  const v = parsed.data;
  const { error } = await ctx.supabase.from("reports").insert({
    reporter_id: ctx.userId, reported_user_id: v.reportedUserId, reason: v.reason, details: v.details,
    trip_id: v.tripId, message_id: v.messageId, review_id: v.reviewId,
  });
  return error ? fail(toErrorCode(error)) : { ok: true };
}
