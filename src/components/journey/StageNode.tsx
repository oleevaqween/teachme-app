"use client";

import { CheckCircle2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StageNodeProps {
  title: string;
  summary: string;
  status: "locked" | "unlocked" | "in_progress" | "completed";
  order: number;
  onClick?: () => void;
}

export function StageNode({
  title,
  summary,
  status,
  order,
  onClick,
}: StageNodeProps) {
  const isClickable = status === "unlocked" || status === "in_progress" || status === "completed";

  return (
    <button
      type="button"
      onClick={isClickable ? onClick : undefined}
      disabled={status === "locked"}
      aria-label={`Stage ${order}: ${title} — ${status}`}
      className={cn(
        "group relative flex w-full flex-col items-center gap-3 rounded-xl border p-4 text-left transition-all duration-200",
        // Completed state
        status === "completed" &&
          "border-green-300 bg-green-50 hover:shadow-md dark:border-green-700 dark:bg-green-950/30",
        // Active / unlocked state
        (status === "unlocked" || status === "in_progress") &&
          "border-primary/50 bg-primary/5 shadow-sm hover:shadow-md hover:border-primary dark:border-primary/40 dark:bg-primary/10",
        // Locked state
        status === "locked" &&
          "cursor-not-allowed border-border bg-muted/50 opacity-60 dark:bg-muted/20"
      )}
    >
      {/* Stage order badge + status icon */}
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full text-small font-bold transition-colors",
          status === "completed" &&
            "bg-green-500 text-white dark:bg-green-600",
          (status === "unlocked" || status === "in_progress") &&
            "bg-primary text-primary-foreground",
          status === "locked" &&
            "bg-muted-foreground/20 text-muted-foreground"
        )}
      >
        {status === "completed" ? (
          <CheckCircle2 className="size-5" aria-hidden="true" />
        ) : status === "locked" ? (
          <Lock className="size-4" aria-hidden="true" />
        ) : (
          <span>{order}</span>
        )}
      </div>

      {/* Title */}
      <h3
        className={cn(
          "text-center text-lead leading-tight",
          status === "completed" && "text-green-800 dark:text-green-200",
          (status === "unlocked" || status === "in_progress") && "text-foreground",
          status === "locked" && "text-muted-foreground"
        )}
      >
        {title}
      </h3>

      {/* Summary */}
      <p
        className={cn(
          "line-clamp-2 text-center text-small leading-relaxed",
          status === "completed" && "text-green-700/80 dark:text-green-300/70",
          (status === "unlocked" || status === "in_progress") && "text-foreground-secondary",
          status === "locked" && "text-muted-foreground/70"
        )}
      >
        {summary}
      </p>

      {/* Status label for screen readers and visual clarity */}
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-label font-medium uppercase tracking-wide",
          status === "completed" &&
            "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
          status === "in_progress" &&
            "bg-primary/10 text-primary dark:bg-primary/20",
          status === "unlocked" &&
            "bg-primary/10 text-primary dark:bg-primary/20",
          status === "locked" &&
            "bg-muted text-muted-foreground"
        )}
      >
        {status === "completed" && "Completed"}
        {status === "in_progress" && "In Progress"}
        {status === "unlocked" && "Ready"}
        {status === "locked" && "Locked"}
      </span>
    </button>
  );
}
