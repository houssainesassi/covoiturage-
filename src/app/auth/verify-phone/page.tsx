import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Smartphone } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatTunisianPhone, isPhoneVerified, normalizeTunisianPhone } from "@/lib/phone";
import { safeNext } from "@/lib/utils";
import type { ErrorCode } from "@/lib/errors";
import { AuthShell } from "@/components/auth/auth-shell";
import { PhoneEntryForm } from "@/components/auth/phone-entry-form";
import { VerifyOtpForm } from "@/components/auth/verify-otp-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).d.auth.verifyPhoneTitle };
}

/** Errors the server may hand over in the URL after sign-up; anything else is ignored. */
const URL_ERRORS = new Set<ErrorCode>(["rate_limited", "sms_send_failed", "phone_taken", "invalid_phone"]);

export default async function VerifyPhonePage({ searchParams }: PageProps<"/auth/verify-phone">) {
  const sp = await searchParams;
  const rawNext = safeNext(typeof sp.next === "string" ? sp.next : undefined, "/");
  const next = rawNext.startsWith("/auth") ? "/" : rawNext;
  const user = await requireUser(`/auth/verify-phone?next=${encodeURIComponent(next)}`);
  const supabase = await createClient();
  const { data: priv } = await supabase.from("profile_private").select("phone").eq("id", user.id).maybeSingle();
  if (isPhoneVerified(user, priv?.phone)) redirect(`/auth/complete-profile?next=${encodeURIComponent(next)}`);

  const { d } = await getI18n();
  // Code screen once an SMS went out (?phone=…&sent=…), number screen otherwise.
  const codePhone = typeof sp.sent === "string" ? normalizeTunisianPhone(typeof sp.phone === "string" ? sp.phone : "") : null;
  const suggested = normalizeTunisianPhone(typeof sp.phone === "string" ? sp.phone : "") ?? priv?.phone ?? normalizeTunisianPhone(String(user.user_metadata?.phone ?? "")) ?? "";
  const urlError = typeof sp.error === "string" && URL_ERRORS.has(sp.error as ErrorCode) ? (sp.error as ErrorCode) : undefined;
  const changeHref = `/auth/verify-phone?next=${encodeURIComponent(next)}&phone=${encodeURIComponent(codePhone ?? "")}`;
  const later = next.startsWith("/dashboard/trips/new") ? "/" : next;

  return (
    <AuthShell
      title={d.auth.verifyPhoneTitle}
      footer={<Link href={later} className="font-semibold text-slate-600 underline underline-offset-2">{d.completeProfile.later}</Link>}
    >
      {sp.email_verified === "1" && <p role="status" className="mb-5 rounded-xl bg-brand-50 p-3 text-center text-sm font-medium text-brand-800">{d.auth.emailVerified}</p>}
      <div className="mb-6 flex flex-col items-center text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"><Smartphone className="size-7" aria-hidden /></span>
        {codePhone ? (
          <>
            <p className="mt-4 text-slate-700">{d.auth.smsSentTo}</p>
            <p dir="ltr" className="mt-1 font-semibold text-slate-900">{formatTunisianPhone(codePhone)}</p>
            <Link href={changeHref} className="mt-1 text-sm font-semibold text-brand-700 hover:underline">{d.auth.changeNumber}</Link>
          </>
        ) : (
          <p className="mt-4 text-slate-700">{d.auth.verifyPhoneSubtitle}</p>
        )}
      </div>
      {codePhone ? <VerifyOtpForm phone={codePhone} next={next} /> : <PhoneEntryForm next={next} phone={suggested} initialError={urlError} />}
    </AuthShell>
  );
}
