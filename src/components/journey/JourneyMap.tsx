'use client';

import { cn } from '@/lib/utils';
import type { JourneyProgress, StageProgress } from '@/lib/progress-tracker';
import { lastStudiedLabel, resumeTarget, type JourneyActivity } from '@/lib/progress-tracker/activity';
import { CheckCircle2, Lock, Circle, Play } from 'lucide-react';

export interface JourneyStage {
  id: string;
  title: string;
  summary: string;
  theme: string;
  order: number;
}

interface JourneyMapProps {
  stages: JourneyStage[];
  progress: JourneyProgress;
  onStageClick: (stageId: string) => void;
  /** Latest lesson activity; without it the map shows no Continue button and no dates. */
  activity?: JourneyActivity | null;
}

function getStageStatus(
  stageId: string,
  progressStages: StageProgress[]
): StageProgress['status'] {
  const found = progressStages.find((s) => s.stageId === stageId);
  return found?.status ?? 'locked';
}

function ProgressIndicator({
  completedCount,
  totalStages,
  percentComplete,
}: {
  completedCount: number;
  totalStages: number;
  percentComplete: number;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/80 p-(--space-card) shadow-sm backdrop-blur-sm">
      <div className="flex items-center justify-between text-small">
        <span className="font-semibold text-foreground">
          {completedCount}/{totalStages} stages complete
        </span>
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-caption font-medium text-primary">
          {percentComplete}%
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-gradient-to-r from-green-500 via-emerald-500 to-primary transition-all duration-700 ease-out"
          style={{ width: `${percentComplete}%` }}
          role="progressbar"
          aria-valuenow={percentComplete}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Journey progress: ${percentComplete}% complete`}
        />
      </div>
    </div>
  );
}

function StageNodeItem({
  stage,
  status,
  isLast,
  onStageClick,
  lastStudied,
}: {
  stage: JourneyStage;
  status: StageProgress['status'];
  isLast: boolean;
  onStageClick: (stageId: string) => void;
  lastStudied?: string;
}) {
  const isClickable =
    status === 'unlocked' || status === 'in_progress' || status === 'completed';

  return (
    <div className="flex items-stretch gap-4">
      {/* Left column: node + vertical line */}
      <div className="flex flex-col items-center">
        {/* Node button */}
        <button
          onClick={() => isClickable && onStageClick(stage.id)}
          disabled={!isClickable}
          className={cn(
            'relative z-10 flex items-center justify-center rounded-full border-2 transition-all duration-300 shrink-0',
            'size-14',
            status === 'completed' &&
              'border-green-500 bg-gradient-to-br from-green-500 to-emerald-600 text-white shadow-lg shadow-green-500/25',
            status === 'in_progress' &&
              'border-primary bg-gradient-to-br from-primary/10 to-primary/5 text-primary shadow-lg shadow-primary/20 hover:from-primary/15 hover:to-primary/10 cursor-pointer ring-4 ring-primary/10',
            status === 'unlocked' &&
              'border-primary/60 bg-background text-primary shadow-md hover:border-primary hover:bg-primary/5 cursor-pointer',
            status === 'locked' &&
              'border-muted-foreground/20 bg-muted text-muted-foreground/50 cursor-not-allowed'
          )}
          aria-label={`Stage ${stage.order}: ${stage.title} — ${status}`}
        >
          {status === 'completed' && (
            <CheckCircle2 className="size-6" aria-hidden="true" />
          )}
          {status === 'in_progress' && (
            <Play className="size-5 ml-0.5" aria-hidden="true" />
          )}
          {status === 'unlocked' && (
            <Circle className="size-5" aria-hidden="true" />
          )}
          {status === 'locked' && (
            <Lock className="size-4" aria-hidden="true" />
          )}
        </button>

        {/* Vertical connector line */}
        {!isLast && (
          <div className="relative flex-1 w-0.5 min-h-[48px]">
            <div
              className={cn(
                'absolute inset-0 w-full rounded-full transition-colors duration-500',
                status === 'completed'
                  ? 'bg-gradient-to-b from-green-500 to-green-400'
                  : status === 'in_progress'
                    ? 'bg-gradient-to-b from-primary/60 to-primary/20'
                    : 'bg-border'
              )}
              aria-hidden="true"
            />
          </div>
        )}
      </div>

      {/* Right column: stage info card */}
      <div className="flex-1 pb-6">
        <button
          onClick={() => isClickable && onStageClick(stage.id)}
          disabled={!isClickable}
          className={cn(
            'w-full text-left rounded-xl border p-4 transition-all duration-300',
            status === 'completed' &&
              'border-green-200 bg-green-50/50 hover:bg-green-50 dark:border-green-900 dark:bg-green-950/30 dark:hover:bg-green-950/50 cursor-pointer',
            status === 'in_progress' &&
              'border-primary/30 bg-primary/5 hover:bg-primary/10 shadow-sm shadow-primary/5 dark:border-primary/20 cursor-pointer',
            status === 'unlocked' &&
              'border-border bg-card hover:border-primary/30 hover:bg-card/80 hover:shadow-sm cursor-pointer',
            status === 'locked' &&
              'border-border/50 bg-muted/30 opacity-60 cursor-not-allowed'
          )}
          aria-label={`${stage.title}: ${stage.summary}`}
        >
          {/* Stage number + title row */}
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                'inline-flex items-center justify-center rounded-md px-2 py-0.5 text-caption font-bold',
                status === 'completed' && 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
                status === 'in_progress' && 'bg-primary/15 text-primary',
                status === 'unlocked' && 'bg-muted text-muted-foreground',
                status === 'locked' && 'bg-muted/50 text-muted-foreground/50'
              )}
            >
              {stage.order}
            </span>
            <h3
              className={cn(
                'text-lead leading-tight',
                status === 'locked' ? 'text-muted-foreground/60' : 'text-foreground'
              )}
            >
              {stage.title}
            </h3>
            {status === 'in_progress' && (
              <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-label font-medium uppercase tracking-wider text-primary">
                Current
              </span>
            )}
            {status === 'completed' && (
              <span className="ml-auto rounded-full bg-green-100 px-2 py-0.5 text-label font-medium uppercase tracking-wider text-green-700 dark:bg-green-900 dark:text-green-300">
                Done
              </span>
            )}
          </div>

          {/* Summary */}
          <p
            className={cn(
              'mt-1.5 text-small leading-relaxed line-clamp-2',
              status === 'locked' ? 'text-muted-foreground/40' : 'text-foreground-secondary'
            )}
          >
            {stage.summary}
          </p>

          {lastStudied && (
            <p className="mt-1.5 text-caption text-muted-foreground">{lastStudied}</p>
          )}

          {/* Theme tag */}
          {status !== 'locked' && stage.theme && (
            <div className="mt-2.5">
              <span className="inline-block rounded-full bg-muted px-2.5 py-0.5 text-caption font-medium text-muted-foreground">
                {stage.theme}
              </span>
            </div>
          )}
        </button>
      </div>
    </div>
  );
}

export function JourneyMap({ stages, progress, onStageClick, activity }: JourneyMapProps) {
  const sortedStages = [...stages].sort((a, b) => a.order - b.order);
  const targetId = activity ? resumeTarget(sortedStages, progress.stages, activity.stages) : null;
  const target = targetId ? sortedStages.find((s) => s.id === targetId) : undefined;
  const studiedAt = new Map((activity?.stages ?? []).map((a) => [a.stageId, a.lastStudiedAt]));

  return (
    <div className="flex flex-col gap-6">
      {target && (
        <button
          type="button"
          onClick={() => onStageClick(target.id)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-small font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          <Play className="size-4" aria-hidden="true" />
          {`Continue: Stage ${target.order} · ${target.title}`}
        </button>
      )}
      {/* Progress indicator */}
      <ProgressIndicator
        completedCount={progress.completedCount}
        totalStages={progress.totalStages}
        percentComplete={progress.percentComplete}
      />

      {/* Vertical journey path */}
      <div
        className="relative flex flex-col py-2 px-1"
        role="list"
        aria-label="Journey stages"
      >
        {sortedStages.map((stage, index) => {
          const status = getStageStatus(stage.id, progress.stages);
          const isLast = index === sortedStages.length - 1;
          const at = studiedAt.get(stage.id);

          return (
            <StageNodeItem
              key={stage.id}
              stage={stage}
              status={status}
              isLast={isLast}
              onStageClick={onStageClick}
              lastStudied={at && activity ? lastStudiedLabel(new Date(at), activity.now) : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}
