import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MailCheck } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { ConfirmLinkForm } from "@/components/auth/forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).d.auth.confirmTitle, robots: { index: false } };
}

const TYPES = new Set(["signup", "email", "recovery", "email_change"]);

/**
 * Landing page of every Supabase email link (templates link to
 * /auth/confirm?token_hash={{ .TokenHash }}&type=…). Opening it changes nothing:
 * the token is used by the button, on whatever device the email is opened.
 */
export default async function ConfirmPage({ searchParams }: PageProps<"/auth/confirm">) {
  const sp = await searchParams;
  const tokenHash = typeof sp.token_hash === "string" ? sp.token_hash.slice(0, 200) : "";
  const type = typeof sp.type === "string" ? sp.type : "";
  if (!tokenHash || !TYPES.has(type)) redirect("/auth/error");
  const { d } = await getI18n();
  const copy =
    type === "recovery"
      ? { title: d.auth.resetTitle, body: d.auth.confirmRecoveryBody, cta: d.auth.confirmRecoveryCta }
      : type === "email_change"
        ? { title: d.auth.confirmEmailChangeTitle, body: d.auth.confirmEmailChangeBody, cta: d.auth.confirmEmailChangeCta }
        : { title: d.auth.confirmTitle, body: d.auth.confirmBody, cta: d.auth.confirmCta };
  return (
    <AuthShell title={copy.title}>
      <div className="flex flex-col items-center text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"><MailCheck className="size-7" aria-hidden /></span>
        <p className="mt-4 mb-6 text-slate-700">{copy.body}</p>
      </div>
      <ConfirmLinkForm tokenHash={tokenHash} type={type} label={copy.cta} />
    </AuthShell>
  );
}
