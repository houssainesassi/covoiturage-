"use client";
import { useState, useTransition } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { setPhoneVisibilityAction } from "@/actions/profile";
import { useI18n } from "@/lib/i18n/client";
import { Card, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/form";

/** Opt-in switch for showing the driver's number to signed-in members (migration 17). */
export function PhoneVisibility({ initial, hasPhone }: { initial: boolean; hasPhone: boolean }) {
  const { d } = useI18n();
  const t = d.profile.phoneVisibility;
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  const change = (next: boolean) => {
    setOn(next);
    start(async () => {
      const res = await setPhoneVisibilityAction(next);
      if (res.ok) toast.success(t.saved);
      else {
        setOn(!next);
        toast.error(d.errors[res.error]);
      }
    });
  };
  return (
    <Card>
      <CardHeader title={t.title} description={t.body} />
      <div className="grid gap-3 p-5 sm:p-6">
        <Checkbox
          name="phonePublic"
          checked={on}
          disabled={pending || (!hasPhone && !on)}
          onChange={(e) => change(e.currentTarget.checked)}
          label={t.consent}
        />
        <p className="flex items-center gap-2 text-sm text-slate-600" aria-live="polite">
          {on ? <Eye className="size-4 shrink-0 text-brand-700" aria-hidden /> : <EyeOff className="size-4 shrink-0 text-slate-500" aria-hidden />}
          {on ? t.on : t.off}
        </p>
      </div>
    </Card>
  );
}
