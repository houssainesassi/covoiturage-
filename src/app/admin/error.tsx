"use client";
import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";

export default function AdminError({ error, retry }: { error: unknown; retry: () => void }) {
  const { d } = useI18n();
  useEffect(() => console.error(error), [error]);
  return (
    <div role="alert">
      <EmptyState icon={<TriangleAlert className="size-6" aria-hidden />} title={d.admin.loadErrorTitle} body={d.admin.loadErrorBody} action={<Button onClick={() => retry()}>{d.common.retry}</Button>} />
    </div>
  );
}
