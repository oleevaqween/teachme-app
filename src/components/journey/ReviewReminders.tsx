'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { browserLocalStorage } from '@/lib/cv-studio/journey-cv-links';
import { parseReviewItems, reasonLabel, reviewHref, type ReviewItem } from '@/lib/progress-tracker/review-reminders';
import {
  SNOOZE_DAYS,
  readSnoozes,
  snoozeStage,
  unsnoozeStage,
  visibleReminders,
  type Snoozes,
} from '@/lib/progress-tracker/review-snooze';

const RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** The "Due for review" list; renders nothing when nothing is due and nothing was just snoozed. */
export function ReviewList({
  items,
  total,
  onSnooze,
  snoozed,
  onUndo,
}: {
  items: ReviewItem[];
  total: number;
  onSnooze?: (item: ReviewItem) => void;
  /** The reminder just snoozed, offered back with Undo. */
  snoozed?: ReviewItem | null;
  onUndo?: () => void;
}) {
  if (!items.length && !snoozed) return null;
  const more = total - items.length;
  return (
    <section aria-labelledby="review-heading" className="mb-8 rounded-xl border border-border bg-card p-4 sm:p-5">
      <h2 id="review-heading" className="flex items-center gap-2 text-h3 text-foreground">
        <RotateCcw className="size-4 text-primary" aria-hidden="true" />
        Due for review
      </h2>
      {items.length > 0 ? (
        <ul className="mt-3 divide-y divide-border">
          {items.map((item) => (
            <li key={item.stageId} className="flex items-center gap-2">
              <Link
                href={reviewHref(item)}
                className={`flex min-w-0 flex-1 flex-col gap-0.5 rounded-md py-2.5 transition-colors hover:text-primary sm:flex-row sm:items-baseline sm:justify-between sm:gap-4 ${RING}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-small font-medium text-foreground">
                    {`Stage ${item.stageOrder} · ${item.stageTitle}`}
                  </span>
                  <span className="block truncate text-caption text-muted-foreground">{item.journeyTopic}</span>
                </span>
                <span className="shrink-0 text-small text-foreground-secondary">{reasonLabel(item.reason)}</span>
              </Link>
              {onSnooze && (
                <button
                  type="button"
                  onClick={() => onSnooze(item)}
                  aria-label={`Snooze Stage ${item.stageOrder} · ${item.stageTitle} for ${SNOOZE_DAYS} days`}
                  title={`Hide for ${SNOOZE_DAYS} days`}
                  className={`shrink-0 rounded-md px-2 py-1 text-caption text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${RING}`}
                >
                  Snooze
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-small text-muted-foreground">Nothing else is due right now.</p>
      )}
      {more > 0 && <p className="mt-2 text-caption text-muted-foreground">{`and ${more} more`}</p>}
      {snoozed && (
        <p role="status" className="mt-2 text-caption text-muted-foreground">
          {`Snoozed Stage ${snoozed.stageOrder} for ${SNOOZE_DAYS} days.`}{' '}
          <button
            type="button"
            onClick={onUndo}
            className={`rounded-sm font-medium text-foreground underline underline-offset-2 hover:text-primary ${RING}`}
          >
            Undo
          </button>
        </p>
      )}
    </section>
  );
}

/** Loads the review list once; a failed load just shows nothing (reminders are a help, not a must). */
export function ReviewReminders() {
  const [all, setAll] = useState<ReviewItem[]>([]);
  const [snoozes, setSnoozes] = useState<Snoozes>({});
  const [snoozed, setSnoozed] = useState<ReviewItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/teach-me/review')
      .then(async (response) => {
        if (!response.ok) return;
        const items = parseReviewItems(await response.json());
        if (cancelled) return;
        setSnoozes(readSnoozes(browserLocalStorage(), new Date()));
        setAll(items);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const shown = visibleReminders(all, snoozes);
  return (
    <ReviewList
      items={shown.items}
      total={shown.total}
      snoozed={snoozed}
      onSnooze={(item) => {
        setSnoozes(snoozeStage(browserLocalStorage(), item.stageId, new Date()));
        setSnoozed(item);
      }}
      onUndo={() => {
        if (snoozed) setSnoozes(unsnoozeStage(browserLocalStorage(), snoozed.stageId, new Date()));
        setSnoozed(null);
      }}
    />
  );
}
