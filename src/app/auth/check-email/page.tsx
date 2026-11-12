import Link from "next/link";
import { MailCheck } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/format";
import { safeNext } from "@/lib/utils";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResendConfirmationForm, VerifyCodeForm } from "@/components/auth/forms";

export default async function CheckEmailPage({ searchParams }: PageProps<"/auth/check-email">) {
  const sp = await searchParams;
  const { d } = await getI18n();
  const email = typeof sp.email === "string" ? sp.email.slice(0, 254) : "";
  const next = safeNext(typeof sp.next === "string" ? sp.next : undefined, "/");
  // From the login form: the password was right but the email is not confirmed yet.
  const unconfirmed = sp.unconfirmed === "1";
  // When the last email went out (ms, set by the sign-up redirect). An old value simply means no wait;
  // the countdown is only a convenience: Supabase enforces the real limit.
  const sentRaw = Number(typeof sp.sent === "string" ? sp.sent : 0);
  const sentAt = Number.isSafeInteger(sentRaw) && sentRaw > 0 ? sentRaw : 0;
  return (
    <AuthShell
      title={unconfirmed ? d.auth.unconfirmedTitle : d.auth.checkEmailTitle}
      footer={<Link href="/auth/login" className="font-semibold text-brand-700 hover:underline">{d.auth.backToLogin}</Link>}
    >
      <div className="flex flex-col items-center text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"><MailCheck className="size-7" aria-hidden /></span>
        {unconfirmed ? (
          <p className="mt-4 text-slate-700">{fmt(d.auth.unconfirmedBody, { email })}</p>
        ) : email ? (
          <p className="mt-4 text-slate-700">{fmt(d.auth.checkEmailBody, { email })}</p>
        ) : (
          <p className="mt-4 text-slate-700">{d.auth.resendAskEmail}</p>
        )}
      </div>
      <ol className="mt-5 space-y-2 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
        {[d.auth.checkEmailStep1, d.auth.checkEmailStep2, d.auth.checkEmailStep3].map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{i + 1}</span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
      <div className="mt-5">
        <VerifyCodeForm email={email} next={next} />
      </div>
      <p className="mt-4 text-center text-sm text-slate-500">{d.auth.checkEmailHint}</p>
      <div className="mt-3">
        <ResendConfirmationForm email={email} next={next} sentAt={sentAt} />
      </div>
      <p className="mt-4 text-center text-sm text-slate-500">
        {d.auth.wrongEmail}{" "}
        <Link href={`/auth/register?next=${encodeURIComponent(next)}`} className="font-semibold text-brand-700 hover:underline">{d.common.register}</Link>
      </p>
    </AuthShell>
  );
}
