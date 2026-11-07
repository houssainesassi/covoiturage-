import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).d.privacy.title };
}

export default async function Page() {
  const { d } = await getI18n();
  const c = d.privacy;
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-3xl font-bold tracking-tight">{c.title}</h1>
      <p className="mt-1 text-sm text-slate-500">{c.updated}</p>
      <div className="mt-8 space-y-6">
        {c.sections.map((s) => (
          <section key={s.h}>
            <h2 className="text-lg font-semibold">{s.h}</h2>
            <p className="mt-1 leading-relaxed text-slate-600">{s.p}</p>
          </section>
        ))}
      </div>
    </article>
  );
}
