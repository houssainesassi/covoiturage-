import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/format";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { NewPasswordForm } from "@/components/auth/forms";
import { EmailForm } from "@/components/profile/settings-forms";

export default async function SettingsPage() {
  const user = await requireUser("/dashboard/settings");
  const { d } = await getI18n();
  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title={d.settings.title} />
      <Card>
        <CardHeader title={d.settings.language} description={d.settings.languageHint} />
        <div className="p-5 sm:p-6"><LanguageSwitcher /></div>
      </Card>
      <Card>
        <CardHeader title={d.settings.email} description={fmt(d.settings.currentEmail, { email: user.email ?? "" })} />
        <div className="p-5 sm:p-6"><EmailForm /></div>
      </Card>
      <Card>
        <CardHeader title={d.settings.password} />
        <div className="p-5 sm:p-6"><NewPasswordForm /></div>
      </Card>
    </div>
  );
}
