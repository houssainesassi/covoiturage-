import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, MailCheck, Smartphone } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { getUser } from "@/lib/auth";
import { safeNext } from "@/lib/utils";
import { parseMethod } from "@/lib/verification";
import { verificationAvailability } from "@/lib/auth-settings";
import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).d.common.register };
}

export default async function RegisterPage({ searchParams }: PageProps<"/auth/register">) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : undefined);
  if (await getUser()) redirect(next);
  const { d } = await getI18n();
  const available = await verificationAvailability();
  // A method Supabase cannot verify by code right now goes back to the choice.
  const chosen = parseMethod(sp.method);
  const method = chosen && available[chosen] ? chosen : null;
  const href = (m?: string) => `/auth/register?${new URLSearchParams({ ...(m ? { method: m } : {}), next })}`;
  const footer = <>{d.auth.haveAccount} <Link href={`/auth/login?next=${encodeURIComponent(next)}`} className="font-semibold text-brand-700 hover:underline">{d.common.login}</Link></>;

  // Step 1: the user chooses how to receive the 6-digit code.
  if (!method) {
    const options = [
      { m: "phone" as const, Icon: Smartphone, title: d.auth.methodPhoneTitle, desc: d.auth.methodPhoneDesc },
      { m: "email" as const, Icon: MailCheck, title: d.auth.methodEmailTitle, desc: d.auth.methodEmailDesc },
    ];
    return (
      <AuthShell title={d.auth.chooseMethodTitle} subtitle={d.auth.chooseMethodSubtitle} footer={footer}>
        <ul className="space-y-3">
          {options.map(({ m, Icon, title, desc }) => {
            const body = (
              <>
                <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Icon className="size-6" aria-hidden /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-slate-900">{title}</span>
                  <span className="mt-0.5 block text-sm text-slate-600">{available[m] ? desc : d.auth.methodUnavailable}</span>
                </span>
              </>
            );
            return (
              <li key={m}>
                {available[m] ? (
                  <Link href={href(m)} className="flex items-center gap-4 rounded-2xl border border-slate-200 p-4 transition hover:border-brand-500 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-600">
                    {body}
                    <ChevronRight className="size-5 shrink-0 text-slate-400 rtl:rotate-180" aria-hidden />
                  </Link>
                ) : (
                  <div aria-disabled="true" className="flex items-center gap-4 rounded-2xl border border-dashed border-slate-200 p-4 opacity-60">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      </AuthShell>
    );
  }

  // Step 2: the sign-up form for that method.
  return (
    <AuthShell title={d.auth.registerTitle} subtitle={d.auth.registerSubtitle} footer={footer}>
      <p className="mb-5 flex items-center justify-between gap-3 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-800">
        <span className="flex items-center gap-2 font-medium">
          {method === "phone" ? <Smartphone className="size-4" aria-hidden /> : <MailCheck className="size-4" aria-hidden />}
          {method === "phone" ? d.auth.methodChosenPhone : d.auth.methodChosenEmail}
        </span>
        <Link href={href()} className="font-semibold underline underline-offset-2">{d.auth.changeMethod}</Link>
      </p>
      <RegisterForm next={next} method={method} />
    </AuthShell>
  );
}
