import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/format";
import { Logo } from "./logo";

export async function Footer() {
  const { d } = await getI18n();
  const cols = [
    { title: d.footer.platform, links: [{ href: "/search", label: d.nav.search }, { href: "/dashboard/trips/new", label: d.nav.publish }, { href: "/#how", label: d.footer.howItWorks }] },
    { title: d.footer.company, links: [{ href: "/#destinations", label: d.dest.homeTitle }, { href: "/help", label: d.footer.help }] },
    { title: d.footer.legal, links: [{ href: "/terms", label: d.footer.terms }, { href: "/privacy", label: d.footer.privacy }] },
  ];
  return (
    <footer className="mt-auto border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-6 gap-y-8 px-4 py-8 sm:px-6 md:grid-cols-4 md:gap-10 md:py-12">
        <div className="col-span-2 md:col-span-1">
          <Logo name={d.common.appName} />
          <p className="mt-2 max-w-xs text-sm text-slate-500">{d.footer.tagline}</p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <h3 className="text-sm font-semibold text-slate-900">{c.title}</h3>
            <ul className="mt-3 space-y-2">
              {c.links.map((l) => (
                <li key={l.href}><Link href={l.href} className="text-sm text-slate-600 hover:text-brand-700">{l.label}</Link></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-100">
        <div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-2 px-4 py-5 text-xs text-slate-500 sm:px-6">
          <span>{fmt(d.footer.rights, { year: new Date().getFullYear() })}</span>
          <span>{d.footer.madeIn}</span>
        </div>
      </div>
    </footer>
  );
}
