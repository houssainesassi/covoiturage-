import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n/server";
import { site } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).d.help.title };
}

export default async function HelpPage() {
  const { d } = await getI18n();
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-3xl font-bold tracking-tight">{d.help.title}</h1>
      <p className="mt-2 text-slate-500">{d.help.subtitle}</p>
      <div className="mt-8 space-y-3">
        {d.help.faq.map((f) => (
          <details key={f.q} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-[var(--shadow-card)]">
            <summary className="cursor-pointer list-none font-semibold marker:hidden">{f.q}</summary>
            <p className="mt-2 text-slate-600">{f.a}</p>
          </details>
        ))}
      </div>
      {site.supportEmail && (
        <div className="mt-10 rounded-2xl bg-brand-50 p-6">
          <h2 className="font-semibold">{d.help.contactTitle}</h2>
          <p className="mt-1 text-slate-600">{d.help.contactBody}</p>
          <a href={`mailto:${site.supportEmail}`} className="mt-3 inline-block font-semibold text-brand-700 underline" dir="ltr">{site.supportEmail}</a>
        </div>
      )}
    </div>
  );
}
