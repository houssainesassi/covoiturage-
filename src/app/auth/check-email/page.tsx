import Link from "next/link";
import { MailCheck } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/format";
import { safeNext } from "@/lib/utils";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResendConfirmationForm } from "@/components/auth/forms";

export default async function CheckEmailPage({ searchParams }: PageProps<"/auth/check-email">) {
  const sp = await searchParams;
  const { d } = await getI18n();
  const email = typeof sp.email === "string" ? sp.email.slice(0, 254) : "";
  const next = safeNext(typeof sp.next === "string" ? sp.next : undefined, "/");
  // From the login form: the password was right but the email is not confirmed yet.
  const unconfirmed = sp.unconfirmed === "1";
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
        <p className="mt-2 text-sm text-slate-500">{d.auth.checkEmailHint}</p>
      </div>
      <div className="mt-6">
        {/* Right after sign-up an email has just gone out: wait before allowing another. */}
        <ResendConfirmationForm email={email} next={next} startLocked={Boolean(email) && !unconfirmed} />
      </div>
      <p className="mt-4 text-center text-sm text-slate-500">
        {d.auth.wrongEmail}{" "}
        <Link href={`/auth/register?next=${encodeURIComponent(next)}`} className="font-semibold text-brand-700 hover:underline">{d.common.register}</Link>
      </p>
    </AuthShell>
  );
}
