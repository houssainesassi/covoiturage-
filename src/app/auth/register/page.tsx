import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getI18n } from "@/lib/i18n/server";
import { getUser } from "@/lib/auth";
import { emailVerificationEnabled } from "@/lib/auth-settings";
import { safeNext } from "@/lib/utils";
import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).d.common.register };
}

export default async function RegisterPage({ searchParams }: PageProps<"/auth/register">) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : undefined);
  if (await getUser()) redirect(next);
  const [{ d }, open] = await Promise.all([getI18n(), emailVerificationEnabled()]);
  return (
    <AuthShell title={d.auth.registerTitle} subtitle={d.auth.registerSubtitle} footer={<>{d.auth.haveAccount} <Link href={`/auth/login?next=${encodeURIComponent(next)}`} className="font-semibold text-brand-700 hover:underline">{d.common.login}</Link></>}>
      {open ? <RegisterForm next={next} /> : <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{d.errors.signup_unavailable}</p>}
    </AuthShell>
  );
}
