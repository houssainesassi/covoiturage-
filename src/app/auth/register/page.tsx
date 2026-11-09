import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getI18n } from "@/lib/i18n/server";
import { getUser } from "@/lib/auth";
import { safeNext } from "@/lib/utils";
import { parseMethod, type VerifyMethod } from "@/lib/verification";
import { verificationAvailability } from "@/lib/auth-settings";
import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).d.common.register };
}

/** One screen: phone or email, name, password. Then the 6-digit code, then the app. */
export default async function RegisterPage({ searchParams }: PageProps<"/auth/register">) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : undefined);
  if (await getUser()) redirect(next);
  const { d } = await getI18n();
  const available = await verificationAvailability();
  // Phone first: every member has one. Only methods that really send a code are offered.
  const methods = (["phone", "email"] as VerifyMethod[]).filter((m) => available[m]);
  const asked = parseMethod(sp.method);
  const initial = asked && methods.includes(asked) ? asked : methods[0];
  const footer = <>{d.auth.haveAccount} <Link href={`/auth/login?next=${encodeURIComponent(next)}`} className="font-semibold text-brand-700 hover:underline">{d.common.login}</Link></>;

  return (
    <AuthShell title={d.auth.registerTitle} subtitle={d.auth.registerSubtitle} footer={footer}>
      {initial ? (
        <RegisterForm next={next} methods={methods} initial={initial} />
      ) : (
        <p role="status" className="rounded-xl bg-accent-100 p-4 text-sm font-medium text-slate-800">{d.auth.registerUnavailable}</p>
      )}
    </AuthShell>
  );
}
