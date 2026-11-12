import Image from "next/image";
import Link from "next/link";

/** "Waselni Fahs" / "وصّلني الفحص": the place name is set in the accent colour. */
export function Logo({ name }: { name: string }) {
  const cut = name.lastIndexOf(" ");
  const [word, place] = cut > 0 ? [name.slice(0, cut), name.slice(cut + 1)] : [name, ""];
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2" aria-label={name}>
      <Image src="/icons/icon-192.png" alt="" width={36} height={36} className="size-9 rounded-xl shadow-sm" />
      <span className="whitespace-nowrap text-lg font-extrabold tracking-tight text-slate-900">
        {word}
        {place && <span className="text-accent-600"> {place}</span>}
      </span>
    </Link>
  );
}
