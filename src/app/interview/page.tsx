"use client";

import { useState } from "react";
import Link from "next/link";
import { Briefcase, FileText, MessageSquare, Archive, Sparkles } from "lucide-react";
import { useInterviewStore } from "@/store/interview-store";
import { validateRole } from "@/lib/validators/interview";
import { cn } from "@/lib/utils";
import { ApplicationPracticeList } from "@/components/practice/ApplicationPracticeList";

export default function InterviewPage() {
  const { role, setRole } = useInterviewStore();
  const [inputValue, setInputValue] = useState(role);
  const [error, setError] = useState<string | null>(null);
  const [roleConfirmed, setRoleConfirmed] = useState(!!role);

  function handleConfirmRole() {
    const result = validateRole(inputValue);
    if (!result.valid) {
      setError(result.error ?? "Invalid role");
      return;
    }
    setError(null);
    setRole(inputValue.trim());
    setRoleConfirmed(true);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      handleConfirmRole();
    }
  }

  function handleChangeRole() {
    setRoleConfirmed(false);
    setError(null);
  }

  return (
    <div className="relative flex flex-1 flex-col items-center px-(--space-page-inline) py-12 overflow-hidden">
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

      <div className="relative z-10 mx-auto w-full max-w-2xl">
        {/* Header */}
        <div className="mb-10 text-center animate-fade-in-up">
          <div className="mx-auto mb-4 flex size-18 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-accent shadow-lg shadow-primary/10">
            <Briefcase className="size-9 text-primary" aria-hidden="true" />
          </div>
          <h1 className="text-h1 text-foreground">
            Interview Prep
          </h1>
          <p className="mt-2 text-lead text-foreground-secondary">
            Practice with challenging role-specific questions and get actionable feedback.
          </p>
        </div>

        <section aria-labelledby="practice-applications" className="mb-10">
          <h2 id="practice-applications" className="mb-3 text-h3 text-foreground">Practise for a CV or application</h2>
          <ApplicationPracticeList />
        </section>

        <h2 className="mb-3 text-h3 text-foreground">Quick practice by job title</h2>
        {/* Role input section */}
        {!roleConfirmed ? (
          <div className="rounded-2xl border border-primary/40 bg-card/80 p-6 shadow-lg shadow-primary/5 backdrop-blur-sm animate-fade-in-up delay-200" style={{ animationFillMode: "both" }}>
            <label
              htmlFor="role-input"
              className="mb-2 block text-small font-medium text-foreground"
            >
              Target Role
            </label>
            <p className="mb-3 text-small text-foreground-secondary">
              Enter the job role you are preparing for (2–100 characters).
            </p>
            <div className="flex gap-3">
              <input
                id="role-input"
                type="text"
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={handleKeyDown}
                placeholder="e.g. Senior Frontend Engineer"
                maxLength={100}
                className={cn(
                  "min-w-0 flex-1 rounded-xl border bg-background px-4 py-3 text-body text-foreground placeholder:text-muted-foreground transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring focus:shadow-md focus:shadow-primary/10",
                  error
                    ? "border-destructive focus:ring-destructive"
                    : "border-input"
                )}
                aria-invalid={!!error}
                aria-describedby={error ? "role-error" : undefined}
              />
              <button
                type="button"
                onClick={handleConfirmRole}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-small font-medium text-primary-foreground shadow-md shadow-primary/20 transition-all duration-200 hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
                disabled={!inputValue.trim()}
              >
                <Sparkles className="size-4" aria-hidden="true" />
                Continue
              </button>
            </div>
            {error && (
              <p id="role-error" className="mt-2 text-small text-destructive" role="alert">
                {error}
              </p>
            )}
            <p className="mt-2 text-small text-muted-foreground">
              {inputValue.trim().length}/100 characters
            </p>
          </div>
        ) : (
          /* Options section - shown after role is confirmed */
          <div className="space-y-6 animate-fade-in-up delay-100" style={{ animationFillMode: "both" }}>
            {/* Active role display */}
            <div className="flex items-center justify-between rounded-xl border border-primary/40 bg-gradient-to-r from-primary/10 to-accent px-5 py-4 shadow-sm">
              <div>
                <p className="text-label font-medium uppercase tracking-wider text-primary">
                  Preparing for
                </p>
                <p className="text-lead font-semibold text-foreground">{role}</p>
              </div>
              <button
                type="button"
                onClick={handleChangeRole}
                className="rounded-lg border border-primary/40 px-3 py-1.5 text-small font-medium text-primary transition-colors hover:bg-accent hover:text-foreground"
              >
                Change
              </button>
            </div>

            {/* Option cards */}
            <div className="grid gap-4 sm:grid-cols-3">
              <Link
                href="/cv-studio"
                className="group relative flex flex-col items-center gap-3 rounded-2xl border border-border/60 bg-card/80 p-6 text-center shadow-md shadow-primary/5 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <div className="flex size-14 items-center justify-center rounded-xl bg-gradient-to-br from-primary/10 to-accent transition-transform duration-300 group-hover:scale-110">
                  <FileText className="size-7 text-primary" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-lead leading-snug text-card-foreground">
                    Open CV Studio
                  </h2>
                  <p className="mt-1 text-small text-foreground-secondary">
                    Tailor your CV and cover letter to a job ad
                  </p>
                </div>
              </Link>

              <Link
                href="/interview/mock"
                className="group relative flex flex-col items-center gap-3 rounded-2xl border border-border/60 bg-card/80 p-6 text-center shadow-md shadow-primary/5 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <div className="flex size-14 items-center justify-center rounded-xl bg-gradient-to-br from-primary/10 to-accent transition-transform duration-300 group-hover:scale-110">
                  <MessageSquare className="size-7 text-primary" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-lead leading-snug text-card-foreground">
                    Mock Questions
                  </h2>
                  <p className="mt-1 text-small text-foreground-secondary">
                    Practice tough interview questions
                  </p>
                </div>
              </Link>

              <Link
                href="/interview/archive"
                className="group relative flex flex-col items-center gap-3 rounded-2xl border border-border/60 bg-card/80 p-6 text-center shadow-md shadow-primary/5 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <div className="flex size-14 items-center justify-center rounded-xl bg-gradient-to-br from-primary/10 to-accent transition-transform duration-300 group-hover:scale-110">
                  <Archive className="size-7 text-primary" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-lead leading-snug text-card-foreground">
                    Archive
                  </h2>
                  <p className="mt-1 text-small text-foreground-secondary">
                    Review past questions and scores
                  </p>
                </div>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
