"use server";
import { revalidatePath } from "next/cache";
import { fail, toErrorCode, type ActionResult } from "@/lib/errors";
import { reviewSchema } from "@/lib/validation";
import { authed } from "./_util";

export async function submitReviewAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const parsed = reviewSchema.safeParse({
    tripId: fd.get("tripId"), revieweeId: fd.get("revieweeId"), rating: fd.get("rating"), comment: fd.get("comment") || undefined,
  });
  if (!parsed.success) return fail("invalid_rating");
  const { error } = await ctx.supabase.rpc("submit_review", {
    p_trip_id: parsed.data.tripId, p_reviewee_id: parsed.data.revieweeId, p_rating: parsed.data.rating, p_comment: parsed.data.comment,
  });
  if (error) return fail(toErrorCode(error));
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}
