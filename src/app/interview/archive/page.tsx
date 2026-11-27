"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, ChevronDown, ChevronUp, Archive } from "lucide-react";
import { useInterviewStore } from "@/store/interview-store";
import { ArchiveList } from "@/components/interview/ArchiveList";
import type { ArchivedQuestion } from "@/lib/interview-engine";

export default function ArchivePage() {
  const { role, removeArchivedQuestion } = useInterviewStore();
  const [groupedArchive, setGroupedArchive] = useState<Record<string, ArchivedQuestion[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUnarchiving, setIsUnarchiving] = useState<string | null>(null);
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set());

  // Fetch archived questions on mount
  useEffect(() => {
    async function fetchArchive() {
      setIsLoading(true);
      setError(null);

      try {
        if (role) {
          const response = await fetch(
            `/api/interview/archive?role=${encodeURIComponent(role)}`
          );

          if (!response.ok) {
            const data = await response.json();
            setError(data.error ?? "Failed to load archive.");
            return;
          }

          const data = await response.json();
          const archive: ArchivedQuestion[] = data.archive ?? [];

          if (archive.length > 0) {
            setGroupedArchive({ [role]: archive });
            setExpandedRoles(new Set([role]));
          } else {
            setGroupedArchive({});
          }
        } else {
          setGroupedArchive({});
        }
      } catch {
        setError("Failed to load archive. Please check your connection and try again.");
      } finally {
        setIsLoading(false);
      }
    }

    fetchArchive();
  }, [role]);

  async function handleUnarchive(questionId: string) {
    setIsUnarchiving(questionId);
    try {
      const response = await fetch("/api/interview/archive", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error ?? "Failed to unarchive question.");
        return;
      }

      removeArchivedQuestion(questionId);
      setGroupedArchive((prev) => {
        const updated = { ...prev };
        for (const r of Object.keys(updated)) {
          updated[r] = updated[r].filter((q) => q.id !== questionId);
          if (updated[r].length === 0) {
            delete updated[r];
          }
        }
        return updated;
      });
    } catch {
      setError("Failed to unarchive question. Please try again.");
    } finally {
      setIsUnarchiving(null);
    }
  }

  function toggleRoleExpand(roleName: string) {
    setExpandedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(roleName)) {
        next.delete(roleName);
      } else {
        next.add(roleName);
      }
      return next;
    });
  }

  const roleNames = Object.keys(groupedArchive);

  return (
    <div className="relative flex flex-1 flex-col px-(--space-page-inline) py-8 overflow-hidden">
      {/* Animated background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {/* Orbiting circle */}
        <div className="animate-orbit absolute left-[10%] top-[20%] h-32 w-32 rounded-full border border-primary/40 opacity-60" />
        {/* Drifting filled shape */}
        <div className="animate-drift absolute right-[15%] top-[30%] h-24 w-24 rounded-2xl bg-primary/20 rotate-12" />
        {/* Slow spinning ring */}
        <div className="animate-spin-slow absolute bottom-[20%] left-[20%] h-48 w-48 rounded-full border-2 border-dashed border-primary/30" />
        {/* Floating dot */}
        <div className="animate-float absolute right-[25%] bottom-[30%] h-4 w-4 rounded-full bg-primary/40" />
        {/* Large faint gradient — kept for warmth but smaller blur */}
        <div className="animate-float-slow absolute -left-20 top-[10%] h-72 w-72 rounded-full bg-gradient-to-br from-primary/20 to-transparent blur-2xl" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-3xl">
        {/* Back navigation */}
        <Link
          href="/interview"
          className="mb-6 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-small font-medium text-primary transition-all duration-200 hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to Interview
        </Link>

        {/* Page header */}
        <div className="mb-8 animate-fade-in-up">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/10 to-accent shadow-md shadow-primary/10">
              <Archive className="size-6 text-primary" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-h2 text-foreground sm:text-h1">
                Question Archive
              </h1>
              <p className="text-small text-foreground-secondary">
                {role
                  ? <>Archived questions for <span className="font-medium text-primary">{role}</span></>
                  : "Review your previously archived interview questions."
                }
              </p>
            </div>
          </div>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20 animate-fade-in-up">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
              <Loader2 className="relative size-10 animate-spin text-primary" aria-hidden="true" />
            </div>
            <p className="mt-6 text-small text-muted-foreground">Loading archive...</p>
          </div>
        )}

        {/* Error state */}
        {error && !isLoading && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 shadow-sm animate-fade-in-up" role="alert">
            <p className="text-small text-destructive">{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              className="mt-3 rounded-lg bg-accent px-3 py-1.5 text-small font-medium text-primary transition-colors hover:bg-primary/15 hover:text-accent-foreground"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* No role set */}
        {!isLoading && !error && !role && (
          <div className="rounded-2xl border border-border/60 bg-card/80 p-10 text-center shadow-lg shadow-primary/5 backdrop-blur-sm animate-fade-in-up">
            <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-muted">
              <Archive className="size-8 text-muted-foreground/40" aria-hidden="true" />
            </div>
            <p className="mt-4 text-lead text-foreground-secondary">
              Please select a role first to view your archived questions.
            </p>
            <Link
              href="/interview"
              className="mt-4 inline-flex items-center rounded-lg bg-accent px-4 py-2 text-small font-medium text-primary transition-colors hover:bg-primary/15 hover:text-accent-foreground"
            >
              Go to Interview Setup
            </Link>
          </div>
        )}

        {/* Empty archive (role set but no questions) */}
        {!isLoading && !error && role && roleNames.length === 0 && (
          <div className="rounded-2xl border border-border/60 bg-card/80 p-10 text-center shadow-lg shadow-primary/5 backdrop-blur-sm animate-fade-in-up">
            <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-muted">
              <Archive className="size-8 text-muted-foreground/40" aria-hidden="true" />
            </div>
            <p className="mt-4 text-lead text-foreground-secondary">
              No archived questions yet for this role.
            </p>
            <p className="mt-1 text-small text-foreground-secondary">
              Practice mock questions and archive them to track your progress.
            </p>
            <Link
              href="/interview/mock"
              className="mt-4 inline-flex items-center rounded-lg bg-accent px-4 py-2 text-small font-medium text-primary transition-colors hover:bg-primary/15 hover:text-accent-foreground"
            >
              Start Mock Questions
            </Link>
          </div>
        )}

        {/* Archive grouped by role */}
        {!isLoading && !error && roleNames.length > 0 && (
          <div className="space-y-4 animate-fade-in-up delay-200" style={{ animationFillMode: "both" }}>
            {roleNames.map((roleName) => (
              <div
                key={roleName}
                className="overflow-hidden rounded-2xl border border-border/60 bg-card/80 shadow-md backdrop-blur-sm transition-all duration-300 hover:shadow-lg"
              >
                {/* Role group header */}
                <button
                  type="button"
                  onClick={() => toggleRoleExpand(roleName)}
                  className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-muted/50"
                  aria-expanded={expandedRoles.has(roleName)}
                  aria-controls={`archive-role-${roleName}`}
                >
                  <div className="flex items-center gap-3">
                    <h2 className="text-lead leading-snug text-foreground">
                      {roleName}
                    </h2>
                    <span className="rounded-full bg-accent px-2.5 py-0.5 text-caption font-medium text-accent-foreground">
                      {groupedArchive[roleName].length} question{groupedArchive[roleName].length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {expandedRoles.has(roleName) ? (
                    <ChevronUp className="size-5 text-muted-foreground transition-transform" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="size-5 text-muted-foreground transition-transform" aria-hidden="true" />
                  )}
                </button>

                {/* Expandable question list */}
                {expandedRoles.has(roleName) && (
                  <div
                    id={`archive-role-${roleName}`}
                    className="border-t border-border/50 px-4 py-4"
                  >
                    <ArchiveList
                      questions={groupedArchive[roleName]}
                      onUnarchive={handleUnarchive}
                      isUnarchiving={isUnarchiving}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
