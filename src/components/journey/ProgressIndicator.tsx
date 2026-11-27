"use client";

interface ProgressIndicatorProps {
  completedCount: number;
  totalStages: number;
  percentComplete: number;
}

export function ProgressIndicator({
  completedCount,
  totalStages,
  percentComplete,
}: ProgressIndicatorProps) {
  return (
    <div className="w-full space-y-2">
      <p className="text-small font-medium text-muted-foreground">
        {completedCount}/{totalStages} stages complete
      </p>
      <div
        className="h-2.5 w-full overflow-hidden rounded-full bg-secondary"
        role="progressbar"
        aria-valuenow={percentComplete}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Journey progress: ${percentComplete}% complete`}
      >
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${percentComplete}%` }}
        />
      </div>
    </div>
  );
}
