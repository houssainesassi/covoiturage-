import type { Metadata } from "next";
import Link from "next/link";
import { CarFront, ChevronRight, CircleCheck, Search } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { getProfile, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmt } from "@/lib/i18n/format";
import { AuthShell } from "@/components/auth/auth-shell";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).d.auth.welcomeTitleNoName };
}

/** First screen after sign-up: passenger or driver. Profile details are asked when needed. */
export default async function WelcomePage() {
  await requireUser("/auth/welcome");
  const supabase = await createClient();
  const [profile, { data: complete }, { d }] = await Promise.all([getProfile(), supabase.rpc("my_profile_complete"), getI18n()]);
  const firstName = profile?.full_name?.trim().split(/\s+/)[0];
  const choices = [
    { href: "/search", Icon: Search, title: d.auth.welcomePassenger, desc: d.auth.welcomePassengerDesc },
    { href: "/dashboard/trips/new", Icon: CarFront, title: d.auth.welcomeDriver, desc: d.auth.welcomeDriverDesc },
  ];
  return (
    <AuthShell title={firstName ? fmt(d.auth.welcomeTitle, { name: firstName }) : d.auth.welcomeTitleNoName} subtitle={d.auth.welcomeSubtitle}>
      <p role="status" className="mb-5 flex items-center gap-2 rounded-xl bg-brand-50 p-3 text-sm font-medium text-brand-800">
        <CircleCheck className="size-5 shrink-0" aria-hidden />{d.auth.accountVerified}
      </p>
      <ul className="space-y-3">
        {choices.map(({ href, Icon, title, desc }) => (
          <li key={href}>
            <Link href={href} className="flex items-center gap-4 rounded-2xl border border-slate-200 p-4 transition hover:border-brand-500 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-600">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Icon className="size-6" aria-hidden /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-slate-900">{title}</span>
                <span className="mt-0.5 block text-sm text-slate-600">{desc}</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-slate-400 rtl:rotate-180" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      {complete === false && (
        <p className="mt-5 text-sm text-slate-600">
          {d.auth.welcomeProfileNote}{" "}
          <Link href="/auth/complete-profile?next=%2F" className="font-semibold text-brand-700 underline">{d.auth.welcomeProfileCta}</Link>
        </p>
      )}
    </AuthShell>
  );
}
