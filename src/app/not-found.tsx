import { getI18n } from "@/lib/i18n/server";
import { ButtonLink } from "@/components/ui/button";

export default async function NotFound() {
  const { d } = await getI18n();
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
      <p className="text-6xl font-extrabold text-brand-600">404</p>
      <h1 className="mt-4 text-2xl font-bold">{d.notFound.title}</h1>
      <p className="mt-2 text-slate-500">{d.notFound.body}</p>
      <ButtonLink href="/" className="mt-6">{d.notFound.home}</ButtonLink>
    </div>
  );
}
