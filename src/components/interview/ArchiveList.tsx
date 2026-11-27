"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, ArchiveRestore, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ArchivedQuestion } from "@/lib/interview-engine";

interface ArchiveListProps {
  questions: ArchivedQuestion[];
  onUnarchive: (questionId: string) => void;
  isUnarchiving?: string | null;
}

function getScoreColor(score: number): string {
  if (score >= 8) return "text-green-600 dark:text-green-400";
  if (score >= 5) return "text-primary";
  return "text-red-600 dark:text-red-400";
}

function getScoreBg(score: number): string {
  if (score >= 8) return "bg-green-100 dark:bg-green-950";
  if (score >= 5) return "bg-accent";
  return "bg-red-100 dark:bg-red-950";
}

function formatDate(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? "s" : ""} ago`;

  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ArchiveList({ questions, onUnarchive, isUnarchiving }: ArchiveListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function toggleExpand(id: string) {
    setExpandedId(expandedId === id ? null : id);
  }

  if (questions.length === 0) {
    return (
      <p className="py-6 text-center text-small text-foreground-secondary">
        No archived questions in this group.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {questions.map((item) => (
        <div
          key={item.id}
          className="rounded-lg border border-border bg-card shadow-sm transition-colors hover:border-primary/40"
        >
          {/* Question header row */}
          <button
            type="button"
            onClick={() => toggleExpand(item.id)}
            className="flex w-full items-start gap-3 px-4 py-3 text-left"
            aria-expanded={expandedId === item.id}
            aria-controls={`archive-answer-${item.id}`}
          >
            {/* Score badge */}
            <div
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-full text-small font-bold",
                getScoreBg(item.score),
                getScoreColor(item.score)
              )}
            >
              {item.score}
            </div>

            {/* Question text and date */}
            <div className="min-w-0 flex-1">
              <p className="text-body font-medium leading-snug text-foreground line-clamp-2">
                {item.question}
              </p>
              <div className="mt-1 flex items-center gap-1.5 text-caption text-muted-foreground">
                <Calendar className="size-3" aria-hidden="true" />
                <span>{formatDate(item.archivedAt)}</span>
              </div>
            </div>

            {/* Expand chevron */}
            {expandedId === item.id ? (
              <ChevronUp className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            ) : (
              <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
          </button>

          {/* Expanded answer section */}
          {expandedId === item.id && (
            <div
              id={`archive-answer-${item.id}`}
              className="border-t border-border px-4 py-3"
            >
              <p className="mb-1 text-label font-medium uppercase tracking-wider text-muted-foreground">
                Your Answer
              </p>
              <p className="whitespace-pre-wrap text-body leading-relaxed text-foreground/80">
                {item.userAnswer}
              </p>

              {/* Unarchive button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onUnarchive(item.id);
                }}
                disabled={isUnarchiving === item.id}
                className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-accent px-3 py-1.5 text-small font-medium text-primary transition-colors hover:bg-primary/15 hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ArchiveRestore className="size-3.5" aria-hidden="true" />
                {isUnarchiving === item.id ? "Removing..." : "Unarchive"}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
