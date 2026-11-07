import type { ReactNode } from "react";

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-[var(--shadow-card)]">
      <table className="w-full min-w-[44rem] text-sm">
        <thead className="bg-slate-50 text-start text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>{head.map((h, i) => <th key={i} className="px-4 py-3 text-start">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <form className="mb-4 flex flex-wrap items-end gap-2">{children}</form>;
}
