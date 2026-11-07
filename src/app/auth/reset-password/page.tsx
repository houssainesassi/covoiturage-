import { getI18n } from "@/lib/i18n/server";
import { requireUser } from "@/lib/auth";
import { AuthShell } from "@/components/auth/auth-shell";
import { NewPasswordForm } from "@/components/auth/forms";

export default async function ResetPasswordPage() {
  // The recovery link signs the user in through /auth/callback before landing here.
  await requireUser("/auth/reset-password");
  const { d } = await getI18n();
  return (
    <AuthShell title={d.auth.resetTitle}>
      <NewPasswordForm redirectAfter />
    </AuthShell>
  );
}
