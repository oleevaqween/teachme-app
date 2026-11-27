"use client";

import { BookOpen, FileText, Globe } from "lucide-react";
import { isWebAddress, type SourceChip } from "@/lib/teaching-session-engine/citations";

const chipBase = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-medium";
const documentClasses = "bg-accent text-accent-foreground border-primary/40";
const webClasses = "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800";
const generalClasses = "bg-muted text-muted-foreground border-border";

/**
 * One source chip under a message.
 * - Document: "Your document: FILENAME", full name in the tooltip.
 * - Web: the source name; a link only when the address is a real http or https address.
 * - General knowledge: a grey chip for facts the reply took from no provided source.
 */
export function SourceLabel({ chip }: { chip: SourceChip }) {
  if (chip.kind === "general") {
    return (
      <span className={`${chipBase} ${generalClasses}`}>
        <BookOpen className="size-3 shrink-0" aria-hidden="true" />
        <span>General knowledge</span>
      </span>
    );
  }

  if (chip.kind === "document") {
    return (
      <span className={`${chipBase} ${documentClasses}`} title={chip.name}>
        <FileText className="size-3 shrink-0" aria-hidden="true" />
        <span className="truncate max-w-[220px]">Your document: {chip.name}</span>
      </span>
    );
  }

  const icon = <Globe className="size-3 shrink-0" aria-hidden="true" />;
  if (isWebAddress(chip.url)) {
    return (
      <a
        href={chip.url}
        target="_blank"
        rel="noopener noreferrer"
        title={chip.name}
        className={`${chipBase} ${webClasses} transition-opacity hover:opacity-80`}
      >
        {icon}
        <span className="truncate max-w-[150px]">{chip.name}</span>
        <span className="sr-only">(opens in new tab)</span>
      </a>
    );
  }

  return (
    <span className={`${chipBase} ${webClasses}`} title={chip.name}>
      {icon}
      <span className="truncate max-w-[150px]">{chip.name}</span>
    </span>
  );
}
