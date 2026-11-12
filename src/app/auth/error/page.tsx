import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { buttonClass } from "@/components/ui/button";

export default async function AuthErrorPage() {
  const { d } = await getI18n();
  return (
    <AuthShell title={d.errorPage.title}>
      <p className="text-slate-600">{d.auth.linkInvalid}</p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/auth/login" className={buttonClass("primary")}>{d.auth.backToLogin}</Link>
        <Link href="/auth/check-email" className={buttonClass("outline")}>{d.auth.resendEmail}</Link>
        <Link href="/auth/forgot-password" className={buttonClass("outline")}>{d.auth.forgotPassword}</Link>
      </div>
    </AuthShell>
  );
}
