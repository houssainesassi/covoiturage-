"use server";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/errors";
import { authed, result } from "./_util";

export async function markAllNotificationsReadAction(): Promise<ActionResult> {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { error } = await ctx.supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", ctx.userId).is("read_at", null);
  revalidatePath("/", "layout");
  return result(error);
}

export async function markNotificationReadAction(id: string): Promise<ActionResult> {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { error } = await ctx.supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("user_id", ctx.userId);
  return result(error);
}
