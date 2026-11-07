"use server";
import { redirect } from "next/navigation";
import { fail, toErrorCode, type ActionResult } from "@/lib/errors";
import { authed } from "./_util";

export async function startConversationAction(tripId: string, passengerId?: string): Promise<ActionResult> {
  const ctx = await authed();
  if ("error" in ctx) {
    if (ctx.error.error === "not_authenticated") redirect(`/auth/login?next=/trips/${tripId}`);
    return ctx.error;
  }
  const { data, error } = await ctx.supabase.rpc("start_conversation", { p_trip_id: tripId, p_passenger_id: passengerId ?? null });
  if (error || !data) return fail(toErrorCode(error));
  redirect(`/dashboard/messages/${data}`);
}
