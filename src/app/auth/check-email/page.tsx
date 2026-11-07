import Link from "next/link";
import { MailCheck } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/format";
import { AuthShell } from "@/components/auth/auth-shell";

export default async function CheckEmailPage({ searchParams }: PageProps<"/auth/check-email">) {
  const sp = await searchParams;
  const { d } = await getI18n();
  const email = typeof sp.email === "string" ? sp.email.slice(0, 200) : "";
  return (
    <AuthShell title={d.auth.checkEmailTitle} footer={<Link href="/auth/login" className="font-semibold text-brand-700 hover:underline">{d.auth.backToLogin}</Link>}>
      <div className="flex flex-col items-center text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"><MailCheck className="size-7" aria-hidden /></span>
        <p className="mt-4 text-slate-700">{fmt(d.auth.checkEmailBody, { email })}</p>
        <p className="mt-2 text-sm text-slate-500">{d.auth.checkEmailHint}</p>
      </div>
    </AuthShell>
  );
}
