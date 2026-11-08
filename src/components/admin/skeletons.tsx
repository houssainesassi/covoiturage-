import { Skeleton } from "@/components/ui/misc";

export function HeaderSkeleton() {
  return <div className="mb-6 space-y-2"><Skeleton className="h-9 w-56" /><Skeleton className="h-5 w-full max-w-md" /></div>;
}

export function TableSkeleton() {
  return (
    <div aria-busy="true">
      <HeaderSkeleton />
      <Skeleton className="mb-4 h-[4.25rem] rounded-2xl" />
      <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4">
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="hidden h-4 w-24 sm:block" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="hidden h-9 w-24 md:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function OverviewSkeleton() {
  return (
    <div aria-busy="true">
      <HeaderSkeleton />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
      <div className="mt-6 grid gap-3 md:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
      <Skeleton className="mt-6 h-64 rounded-2xl" />
    </div>
  );
}
