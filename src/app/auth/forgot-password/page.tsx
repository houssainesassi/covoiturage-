import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotForm } from "@/components/auth/forms";

export default async function ForgotPage() {
  const { d } = await getI18n();
  return (
    <AuthShell title={d.auth.forgotTitle} subtitle={d.auth.forgotSubtitle} footer={<Link href="/auth/login" className="font-semibold text-brand-700 hover:underline">{d.auth.backToLogin}</Link>}>
      <ForgotForm />
    </AuthShell>
  );
}
