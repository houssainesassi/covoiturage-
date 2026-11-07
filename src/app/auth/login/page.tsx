import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getI18n } from "@/lib/i18n/server";
import { getUser } from "@/lib/auth";
import { safeNext } from "@/lib/utils";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).d.common.login };
}

export default async function LoginPage({ searchParams }: PageProps<"/auth/login">) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : undefined);
  if (await getUser()) redirect(next);
  const { d } = await getI18n();
  const notice = next.startsWith("/trips/") ? d.auth.loginToBook : next !== "/dashboard" ? d.auth.loginToContinue : undefined;
  return (
    <AuthShell title={d.auth.loginTitle} subtitle={d.auth.loginSubtitle} footer={<>{d.auth.noAccount} <Link href={`/auth/register?next=${encodeURIComponent(next)}`} className="font-semibold text-brand-700 hover:underline">{d.common.register}</Link></>}>
      <LoginForm next={next} notice={notice} />
    </AuthShell>
  );
}
