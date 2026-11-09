import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MailCheck, Smartphone } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { getUser } from "@/lib/auth";
import { formatTunisianPhone, normalizeTunisianPhone } from "@/lib/phone";
import { safeNext } from "@/lib/utils";
import { AuthShell } from "@/components/auth/auth-shell";
import { VerifyOtpForm } from "@/components/auth/verify-otp-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).d.auth.verifyTitle };
}

/** Code screen before any session: email sign-up, phone sign-up, or phone password reset. */
export default async function VerifyPage({ searchParams }: PageProps<"/auth/verify">) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : undefined, "/");
  const purpose = sp.purpose === "recovery" ? "recovery" : "signup";
  if (purpose === "signup" && (await getUser())) redirect(next);
  const email = typeof sp.email === "string" ? sp.email.slice(0, 200) : "";
  const phone = normalizeTunisianPhone(typeof sp.phone === "string" ? sp.phone : "");
  if (!email && !phone) redirect(purpose === "recovery" ? "/auth/forgot-password" : "/auth/register");
  const { d } = await getI18n();
  const Icon = phone ? Smartphone : MailCheck;
  return (
    <AuthShell
      title={purpose === "recovery" ? d.auth.forgotTitle : d.auth.verifyTitle}
      footer={purpose === "recovery"
        ? <Link href="/auth/login" className="font-semibold text-brand-700 hover:underline">{d.auth.backToLogin}</Link>
        : <>{d.auth.verifiedAlready} <Link href={`/auth/login?next=${encodeURIComponent(next)}`} className="font-semibold text-brand-700 hover:underline">{d.common.login}</Link></>}
    >
      <div className="mb-6 flex flex-col items-center text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"><Icon className="size-7" aria-hidden /></span>
        <p className="mt-4 text-slate-700">{phone ? d.auth.smsSentTo : d.auth.verifySubtitle}</p>
        <p dir="ltr" className="mt-1 max-w-full break-all font-semibold text-slate-900">{phone ? formatTunisianPhone(phone) : email}</p>
        {purpose === "signup" && (
          <p className="mt-1 text-sm text-slate-600">
            {d.auth.wrongIdentifier}{" "}
            <Link href={`/auth/register?method=${phone ? "phone" : "email"}&next=${encodeURIComponent(next)}`} className="font-semibold text-brand-700 hover:underline">{d.auth.changeIdentifier}</Link>
          </p>
        )}
      </div>
      {phone ? <VerifyOtpForm phone={phone} next={next} purpose={purpose} /> : <VerifyOtpForm email={email} next={next} />}
    </AuthShell>
  );
}
