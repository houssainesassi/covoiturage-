import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MailCheck } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { getUser } from "@/lib/auth";
import { safeNext } from "@/lib/utils";
import { AuthShell } from "@/components/auth/auth-shell";
import { VerifyOtpForm } from "@/components/auth/verify-otp-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).d.auth.verifyTitle };
}

export default async function VerifyPage({ searchParams }: PageProps<"/auth/verify">) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : undefined, "/");
  if (await getUser()) redirect(next);
  const email = typeof sp.email === "string" ? sp.email.slice(0, 200) : "";
  if (!email) redirect("/auth/register");
  const { d } = await getI18n();
  return (
    <AuthShell title={d.auth.verifyTitle} footer={<>{d.auth.verifiedAlready} <Link href={`/auth/login?next=${encodeURIComponent(next)}`} className="font-semibold text-brand-700 hover:underline">{d.common.login}</Link></>}>
      <div className="mb-6 flex flex-col items-center text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"><MailCheck className="size-7" aria-hidden /></span>
        <p className="mt-4 text-slate-700">{d.auth.verifySubtitle}</p>
        <p dir="ltr" className="mt-1 max-w-full break-all font-semibold text-slate-900">{email}</p>
      </div>
      <VerifyOtpForm email={email} next={next} />
    </AuthShell>
  );
}
