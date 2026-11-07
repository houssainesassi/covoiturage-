"use client";
import { useEffect } from "react";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { d } = useI18n();
  useEffect(() => console.error(error), [error]);
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
      <h1 className="text-2xl font-bold">{d.errorPage.title}</h1>
      <p className="mt-2 text-slate-500">{d.errorPage.body}</p>
      <Button onClick={reset} className="mt-6">{d.common.retry}</Button>
    </div>
  );
}
