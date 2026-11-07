"use client";
import { useTransition } from "react";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { startConversationAction } from "@/actions/messages";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";

export function ContactButton({ tripId, passengerId, label, variant = "outline", size = "md", className }: { tripId: string; passengerId?: string; label: string; variant?: "outline" | "secondary" | "ghost"; size?: "sm" | "md"; className?: string }) {
  const { d } = useI18n();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      loading={pending}
      className={className}
      onClick={() =>
        start(async () => {
          const res = await startConversationAction(tripId, passengerId);
          if (res && !res.ok) toast.error(d.errors[res.error]);
        })
      }
    >
      <MessageCircle className="size-4" aria-hidden />
      {label}
    </Button>
  );
}
