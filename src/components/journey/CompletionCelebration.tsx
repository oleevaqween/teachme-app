"use client";

import Link from "next/link";
import { PartyPopper, Trophy } from "lucide-react";
import {
  LEARNING_IS_NOT_EXPERIENCE,
  cvEvidenceHref,
  finishedLearningLine,
  type JourneyCvLink,
} from "@/lib/cv-studio/journey-cv-links";

interface CompletionCelebrationProps {
  totalStages: number;
  topic: string;
  /** The CV Studio application this journey came from, when this browser remembers one. */
  cvLink?: JourneyCvLink | null;
}

/**
 * Displays a congratulatory UI when all stages in a journey are completed.
 * Shows journey stats including total stages and topic covered.
 */
export function CompletionCelebration({
  totalStages,
  topic,
  cvLink,
}: CompletionCelebrationProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border bg-gradient-to-b from-primary/5 to-background p-8 text-center shadow-sm">
      <div className="mb-4 flex items-center gap-2 text-h1">
        <PartyPopper className="size-10 text-yellow-500" aria-hidden="true" />{/* type-guard: allow decorative */}
        <Trophy className="size-10 text-yellow-500" aria-hidden="true" />{/* type-guard: allow decorative */}
      </div>

      <h2 className="mb-2 text-h2">
        Journey Complete!
      </h2>

      <p className="mb-6 max-w-md text-lead text-foreground-secondary">
        Congratulations! You&apos;ve successfully completed all stages of your
        learning journey.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-4">
        <div className="rounded-lg border bg-card px-4 py-2 shadow-sm">
          <p className="text-caption text-muted-foreground">Stages Completed</p>
          <p className="text-h3 font-semibold">{totalStages}</p>
        </div>

        <div className="rounded-lg border bg-card px-4 py-2 shadow-sm">
          <p className="text-caption text-muted-foreground">Topic</p>
          <p className="text-h3 font-semibold truncate max-w-[200px]">
            {topic}
          </p>
        </div>
      </div>

      {cvLink && (
        <div className="mt-6 max-w-md rounded-lg border bg-card px-5 py-4 text-left shadow-sm">
          <p className="text-body font-medium text-foreground">{finishedLearningLine(cvLink)}</p>
          <p className="mt-1.5 text-small text-foreground-secondary">{LEARNING_IS_NOT_EXPERIENCE}</p>
          <Link
            href={cvEvidenceHref(cvLink)}
            className="mt-3 inline-flex items-center rounded-lg bg-primary px-4 py-2 text-small font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Add evidence in CV Studio
          </Link>
        </div>
      )}
    </div>
  );
}
