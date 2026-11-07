import Link from "next/link";

export function Logo({ name }: { name: string }) {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label={name}>
      <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="6" cy="18" r="2.2" />
          <circle cx="18" cy="6" r="2.2" />
          <path d="M8 17c5 0 3-10 8-10" />
        </svg>
      </span>
      <span className="text-lg font-extrabold tracking-tight text-slate-900">{name}</span>
    </Link>
  );
}
