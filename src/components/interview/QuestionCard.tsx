"use client";

import { cn } from "@/lib/utils";
import type { MockQuestion } from "@/lib/interview-engine";

interface QuestionCardProps {
  question: MockQuestion;
  currentIndex: number;
  totalQuestions: number;
}

export function QuestionCard({
  question,
  currentIndex,
  totalQuestions,
}: QuestionCardProps) {
  return (
    <div className="rounded-xl border border-primary/40 bg-card p-6 shadow-sm">
      {/* Header: question number and badges */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-small font-medium text-muted-foreground">
          Question {currentIndex + 1} of {totalQuestions}
        </span>
        <div className="flex items-center gap-2">
          {/* Topic area badge */}
          <span className="inline-flex items-center rounded-full bg-accent px-2.5 py-0.5 text-caption font-medium text-accent-foreground">
            {question.topicArea}
          </span>
          {/* Difficulty badge */}
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-0.5 text-caption font-medium",
              question.difficulty === "hard"
                ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                : "bg-accent text-accent-foreground"
            )}
          >
            {question.difficulty === "hard" ? "Hard" : "Medium"}
          </span>
        </div>
      </div>

      {/* Question text */}
      <p className="text-h3 font-medium leading-relaxed text-foreground">
        {question.question}
      </p>
    </div>
  );
}
