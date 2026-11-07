import Image from "next/image";
import { publicUrl } from "@/lib/storage";
import { cn, initials } from "@/lib/utils";

const sizes = { xs: 24, sm: 32, md: 40, lg: 56, xl: 96 } as const;

export function Avatar({ path, name, size = "md", className }: { path?: string | null; name?: string | null; size?: keyof typeof sizes; className?: string }) {
  const px = sizes[size];
  const url = publicUrl("avatars", path);
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 font-semibold text-brand-800 ring-2 ring-white", className)}
      style={{ width: px, height: px, fontSize: px * 0.38 }}
    >
      {url ? <Image src={url} alt={name ?? ""} fill sizes={`${px}px`} className="object-cover" /> : <span aria-hidden>{initials(name)}</span>}
    </span>
  );
}
