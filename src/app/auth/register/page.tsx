import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getI18n } from "@/lib/i18n/server";
import { getUser } from "@/lib/auth";
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
  const { d } = await getI18n();
  return (
    <AuthShell title={d.auth.registerTitle} subtitle={d.auth.registerSubtitle} footer={<>{d.auth.haveAccount} <Link href={`/auth/login?next=${encodeURIComponent(next)}`} className="font-semibold text-brand-700 hover:underline">{d.common.login}</Link></>}>
      <RegisterForm next={next} />
    </AuthShell>
  );
}
