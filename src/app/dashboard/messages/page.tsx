import { MessageCircle } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { Card, PageHeader } from "@/components/ui/card";
import { ConversationList } from "@/components/messages/conversation-list";

export default async function MessagesPage() {
  const user = await requireUser("/dashboard/messages");
  const { d } = await getI18n();
  return (
    <div>
      <PageHeader title={d.messages.title} />
      <Card className="grid grid-cols-1 overflow-hidden md:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="max-h-[70vh] overflow-y-auto md:border-e md:border-slate-200"><ConversationList userId={user.id} /></div>
        <div className="hidden items-center justify-center p-10 text-center text-slate-400 md:flex">
          <div><MessageCircle className="mx-auto size-10" aria-hidden /><p className="mt-2 text-sm">{d.messages.select}</p></div>
        </div>
      </Card>
    </div>
  );
}
