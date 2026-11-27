"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { Loader2, ArrowLeft, Info } from "lucide-react";
import Link from "next/link";
import { useJourneyStore } from "@/store/journey-store";
import { JourneyMap } from "@/components/journey/JourneyMap";
import { TeachingSession } from "@/components/journey/TeachingSession";
import { studyTimeSaved } from "@/components/journey/use-study-time";
import { LESSON_PAGE } from "@/components/journey/reading-width";
import { CompletionCelebration } from "@/components/journey/CompletionCelebration";
import { migrateLegacyJourney } from "@/lib/journey-map-generator/legacy-migration";
import type { LegacyJourney } from "@/lib/journey-map-generator/legacy-migration";
import type { Journey } from "@/lib/curriculum-engine";
import type { JourneyProgress } from "@/lib/progress-tracker";
import { parseActivity, type JourneyActivity } from "@/lib/progress-tracker/activity";
import { browserLocalStorage, findJourneyCvLink } from "@/lib/cv-studio/journey-cv-links";

interface InteractiveJourneyData {
  id: string;
  topic: string;
  isInteractive: true;
  stages: {
    id: string;
    title: string;
    summary: string;
    theme: string;
    order: number;
    topicsCovered: string[];
  }[];
  totalStages: number;
  createdAt: string;
}

type JourneyData = (Journey & { isInteractive: false }) | InteractiveJourneyData;

export default function JourneyPage() {
  const params = useParams();
  const { currentJourney, isGenerating, progressMessage } = useJourneyStore();

  const [journey, setJourney] = useState<JourneyData | null>(null);
  const [progress, setProgress] = useState<JourneyProgress | null>(null);
  const [activity, setActivity] = useState<JourneyActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Teaching session state: which stage is being viewed
  const [activeStageId, setActiveStageId] = useState<string | null>(null);

  const journeyId = params.id as string;

  const fetchProgress = useCallback(async () => {
    try {
      const response = await fetch(`/api/journey/${journeyId}/progress`);
      if (response.ok) {
        const data: JourneyProgress = await response.json();
        setProgress(data);
      }
    } catch {
      // Non-critical: progress will show default state
    }
  }, [journeyId]);

  const fetchActivity = useCallback(async () => {
    try {
      const response = await fetch(`/api/journey/${journeyId}/activity`);
      const stages = response.ok ? parseActivity(await response.json()) : null;
      setActivity(stages ? { stages, now: new Date() } : null);
    } catch {
      // Non-critical: without activity the map shows no Continue button and no dates.
      setActivity(null);
    }
  }, [journeyId]);

  useEffect(() => {
    // If generating, wait for the journey to be set in the store
    if (isGenerating) {
      setLoading(true);
      return;
    }

    // If the current journey from store matches the ID (just generated)
    if (currentJourney && currentJourney.id === journeyId) {
      // Treat store journey as potentially interactive — refetch from API
      // to get the full response shape with isInteractive flag
      fetchJourney();
      return;
    }

    fetchJourney();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journeyId, isGenerating]);

  // The CV Studio link lives only in this browser; it is read once the journey has loaded,
  // which only happens in the browser, so the server render never touches storage.
  const cvLink = useMemo(
    () => (journey?.isInteractive ? findJourneyCvLink(browserLocalStorage(), journeyId) : null),
    [journey, journeyId]
  );

  // Update journey when store changes (generation completes)
  useEffect(() => {
    if (currentJourney && currentJourney.id === journeyId && !isGenerating) {
      fetchJourney();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentJourney, journeyId, isGenerating]);

  async function fetchJourney() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/journey/${journeyId}`);
      if (!response.ok) {
        throw new Error("Journey not found");
      }
      const data: JourneyData = await response.json();
      setJourney(data);

      // If interactive, also fetch progress and the latest lesson activity
      if (data.isInteractive) {
        await Promise.all([fetchProgress(), fetchActivity()]);
      }
    } catch {
      setError(
        "This journey could not be found. It may have been removed or the link is invalid."
      );
    } finally {
      setLoading(false);
    }
  }

  function handleStageClick(stageId: string) {
    setActiveStageId(stageId);
  }

  function handleBackToMap() {
    setActiveStageId(null);
    // Refresh progress and activity when returning from a teaching session. Activity waits until the
    // lesson has closed and its last study time has been saved, so the map shows the full total.
    fetchProgress();
    window.setTimeout(() => void studyTimeSaved().then(fetchActivity), 0);
  }

  // Loading state
  if (loading || isGenerating) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center px-4">
        <Loader2
          className="size-8 animate-spin text-primary"
          aria-hidden="true"
        />
        <p className="mt-4 text-small font-medium text-foreground">
          {isGenerating
            ? progressMessage || "Generating your journey..."
            : "Loading journey..."}
        </p>
        <p className="mt-1 text-small text-muted-foreground">
          This may take a moment
        </p>
      </div>
    );
  }

  // Error state
  if (error || !journey) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
        <p className="text-small text-destructive">
          {error || "Journey not found."}
        </p>
        <Link
          href="/teach-me"
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-small font-medium text-primary-foreground transition-colors hover:bg-primary/80"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to Teach Me
        </Link>
      </div>
    );
  }

  // Legacy journey: migrate sections to stages and display using JourneyMap
  if (!journey.isInteractive) {
    return (
      <LegacyJourneyView
        journey={journey}
        journeyId={journeyId}
      />
    );
  }

  // Interactive journey: Teaching session view
  if (activeStageId) {
    const activeStage = journey.stages.find((s) => s.id === activeStageId);

    if (!activeStage) {
      // Stage not found, go back to map
      setActiveStageId(null);
      return null;
    }

    return (
      <div className={LESSON_PAGE}>
        <TeachingSession
          journeyId={journeyId}
          stageId={activeStageId}
          stageTitle={activeStage.title}
          topicsCovered={activeStage.topicsCovered}
          onBack={handleBackToMap}
          role={cvLink?.role || undefined}
        />
      </div>
    );
  }

  // Interactive journey: Journey Map view
  return (
    <div className="mx-auto w-full max-w-6xl px-(--space-page-inline) py-6 sm:py-8">
      {/* Back navigation */}
      <Link
        href="/teach-me"
        className="mb-6 inline-flex items-center gap-1.5 text-small text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Back to Teach Me
      </Link>

      {/* Journey header */}
      <header className="mb-8">
        <h1 className="text-h2 text-foreground sm:text-h1">
          {journey.topic}
        </h1>
        <p className="mt-2 text-small text-muted-foreground">
          {journey.totalStages} stages · Created{" "}
          {new Date(journey.createdAt).toLocaleDateString()}
        </p>
      </header>

      {/* Completion celebration when all stages done */}
      {progress && progress.percentComplete === 100 && (
        <div className="mb-8">
          <CompletionCelebration
            totalStages={progress.totalStages}
            topic={journey.topic}
            cvLink={cvLink}
          />
        </div>
      )}

      {/* Journey map with stages and progress */}
      {progress && (
        <JourneyMap
          stages={journey.stages}
          progress={progress}
          onStageClick={handleStageClick}
          activity={activity}
        />
      )}

      {/* Fallback if progress hasn't loaded yet */}
      {!progress && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-small text-muted-foreground">
            Loading progress...
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * LegacyJourneyView — renders a legacy (non-interactive) journey using
 * the new JourneyMap UI by migrating sections to stages on the fly.
 *
 * All stages are shown as "unlocked" since there's no teaching session
 * or progression tracking for legacy content — this is a read-only view.
 */
function LegacyJourneyView({
  journey,
  journeyId,
}: {
  journey: Journey & { isInteractive: false };
  journeyId: string;
}) {
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);

  // Migrate legacy sections to stages (pure function, memoized)
  const migratedStages = useMemo(() => {
    const legacyJourney: LegacyJourney = {
      id: journeyId,
      topic: journey.topic,
      sections: journey.sections.map((section) => ({
        id: section.id,
        journeyId: journeyId,
        title: section.title,
        content: section.content,
        order: section.order,
        sourceTag: section.sourceTag,
      })),
    };
    return migrateLegacyJourney(legacyJourney);
  }, [journey, journeyId]);

  // Build a synthetic "all unlocked" progress state for legacy journeys
  const legacyProgress: JourneyProgress = useMemo(() => {
    return {
      journeyId,
      stages: migratedStages.map((stage) => ({
        stageId: stage.id,
        journeyId,
        status: "unlocked" as const,
      })),
      completedCount: 0,
      totalStages: migratedStages.length,
      percentComplete: 0,
    };
  }, [migratedStages, journeyId]);

  // Find the selected section's content for detail display
  const selectedSection = selectedStageId
    ? journey.sections.find((s) => {
        // Match by stage order (stage IDs are "stage-{journeyId}-{order}")
        const orderMatch = selectedStageId.match(/-(\d+)$/);
        if (orderMatch) {
          return s.order === parseInt(orderMatch[1], 10);
        }
        return false;
      })
    : null;

  function handleStageClick(stageId: string) {
    setSelectedStageId(stageId);
  }

  function handleBackToMap() {
    setSelectedStageId(null);
  }

  // Detail view for a selected legacy section
  if (selectedSection) {
    return (
      <div className="mx-auto w-full max-w-4xl px-(--space-page-inline) py-6 sm:py-8">
        <button
          onClick={handleBackToMap}
          className="mb-6 inline-flex items-center gap-1.5 text-small text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to Journey Map
        </button>

        <article className="prose reading reading-lesson max-w-none">
          <h1>{selectedSection.title}</h1>
          <div className="whitespace-pre-wrap">{selectedSection.content}</div>
        </article>
      </div>
    );
  }

  // Journey map view for legacy content
  return (
    <div className="mx-auto w-full max-w-6xl px-(--space-page-inline) py-6 sm:py-8">
      {/* Back navigation */}
      <Link
        href="/teach-me"
        className="mb-6 inline-flex items-center gap-1.5 text-small text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Back to Teach Me
      </Link>

      {/* Journey header */}
      <header className="mb-6">
        <h1 className="text-h2 text-foreground sm:text-h1">
          {journey.topic}
        </h1>
        <p className="mt-2 text-small text-muted-foreground">
          {migratedStages.length} stages · Created{" "}
          {new Date(journey.createdAt).toLocaleDateString()}
        </p>
      </header>

      {/* Legacy journey banner */}
      <div className="mb-6 flex items-start gap-3 rounded-lg border border-border bg-muted/50 p-4">
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="text-small text-muted-foreground">
          <p className="font-medium text-foreground">Legacy Journey</p>
          <p className="mt-0.5">
            This journey was created with the previous format. It&apos;s displayed
            using the new map view for easier navigation. Interactive teaching
            sessions are not available for legacy content.
          </p>
        </div>
      </div>

      {/* Journey map with migrated stages */}
      <JourneyMap
        stages={migratedStages}
        progress={legacyProgress}
        onStageClick={handleStageClick}
      />
    </div>
  );
}
