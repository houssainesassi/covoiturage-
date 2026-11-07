import { Star } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { getLocationMap } from "@/lib/locations";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/i18n/format";
import { locName } from "@/lib/names";
import { routeLabel } from "@/lib/notifications";
import { Card, PageHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, Tabs } from "@/components/ui/misc";
import { ReviewForm } from "@/components/reviews/review-form";
import { ReviewList } from "@/components/reviews/review-list";

export default async function ReviewsPage({ searchParams }: PageProps<"/dashboard/reviews">) {
  const user = await requireUser("/dashboard/reviews");
  const raw = (await searchParams).tab;
  const tab = raw === "received" || raw === "given" ? raw : "write";
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const locs = await getLocationMap();
  const { data: pending } = await supabase.rpc("pending_reviews");

  let list = null;
  if (tab !== "write") {
    const { data } = tab === "received"
      ? await supabase.from("reviews").select("id, rating, comment, created_at, reviewee_role, is_hidden, is_demo, person:profiles!reviews_reviewer_id_fkey(id, full_name, avatar_path)").eq("reviewee_id", user.id).order("created_at", { ascending: false }).limit(100)
      : await supabase.from("reviews").select("id, rating, comment, created_at, reviewee_role, is_hidden, person:profiles!reviews_reviewee_id_fkey(id, full_name, avatar_path)").eq("reviewer_id", user.id).order("created_at", { ascending: false }).limit(100);
    list = data ?? [];
  }

  return (
    <div>
      <PageHeader title={d.reviews.title} />
      <Tabs active={tab} tabs={[
        { key: "write", label: d.reviews.toWrite, href: "/dashboard/reviews", count: pending?.length },
        { key: "received", label: d.reviews.received, href: "/dashboard/reviews?tab=received" },
        { key: "given", label: d.reviews.given, href: "/dashboard/reviews?tab=given" },
      ]} />
      {tab === "write" ? (
        !(pending ?? []).length ? <EmptyState icon={<Star className="size-6" />} title={d.reviews.emptyToWrite} /> : (
          <div className="grid gap-4 md:grid-cols-2">
            {pending!.map((p) => (
              <Card key={`${p.trip_id}-${p.reviewee_id}`} className="p-5">
                <div className="mb-4 flex items-center gap-3">
                  <Avatar path={p.reviewee_avatar} name={p.reviewee_name} />
                  <div className="min-w-0">
                    <p className="font-semibold">{p.reviewee_role === "driver" ? d.reviews.rateDriver : d.reviews.ratePassenger}: {p.reviewee_name}</p>
                    <p className="truncate text-sm text-slate-500">{routeLabel(locName(locs.get(p.origin_id), locale), locName(locs.get(p.destination_id), locale), locale)} · {formatDate(p.departure_at, locale, "short")}</p>
                  </div>
                </div>
                <ReviewForm tripId={p.trip_id} revieweeId={p.reviewee_id} />
              </Card>
            ))}
          </div>
        )
      ) : (
        <Card className="px-5 sm:px-6">
          <ReviewList reviews={list ?? []} d={d} locale={locale} empty={tab === "received" ? d.reviews.emptyReceived : d.reviews.emptyGiven} />
        </Card>
      )}
    </div>
  );
}
