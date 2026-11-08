"use client";
import type { ComponentProps } from "react";
import { Select } from "@/components/ui/form";

/** Applies the filter as soon as a value is picked. */
export function FilterSelect(props: ComponentProps<typeof Select>) {
  return <Select {...props} className="h-11! min-w-0 flex-1 basis-[45%] text-sm! sm:w-auto sm:flex-none sm:basis-auto" onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
