import Image from "next/image";
import Link from "next/link";

export function Logo({ name }: { name: string }) {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label={name}>
      <Image src="/icons/icon-192.png" alt="" width={36} height={36} className="size-9 rounded-xl shadow-sm" />
      <span className="text-lg font-extrabold tracking-tight text-slate-900">{name}</span>
    </Link>
  );
}
