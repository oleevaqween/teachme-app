'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { parseReviewItems, reasonLabel, reviewHref, type ReviewItem } from '@/lib/progress-tracker/review-reminders';

/** The "Due for review" list; renders nothing when nothing is due. */
export function ReviewList({ items, total }: { items: ReviewItem[]; total: number }) {
  if (!items.length) return null;
  const more = total - items.length;
  return (
    <section aria-labelledby="review-heading" className="mb-8 rounded-xl border border-border bg-card p-4 sm:p-5">
      <h2 id="review-heading" className="flex items-center gap-2 text-h3 text-foreground">
        <RotateCcw className="size-4 text-primary" aria-hidden="true" />
        Due for review
      </h2>
      <ul className="mt-3 divide-y divide-border">
        {items.map((item) => (
          <li key={item.stageId}>
            <Link
              href={reviewHref(item)}
              className="flex flex-col gap-0.5 rounded-md py-2.5 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
            >
              <span className="min-w-0">
                <span className="block truncate text-small font-medium text-foreground">
                  {`Stage ${item.stageOrder} · ${item.stageTitle}`}
                </span>
                <span className="block truncate text-caption text-muted-foreground">{item.journeyTopic}</span>
              </span>
              <span className="shrink-0 text-small text-foreground-secondary">{reasonLabel(item.reason)}</span>
            </Link>
          </li>
        ))}
      </ul>
      {more > 0 && <p className="mt-2 text-caption text-muted-foreground">{`and ${more} more`}</p>}
    </section>
  );
}

/** Loads the review list once; a failed load just shows nothing (reminders are a help, not a must). */
export function ReviewReminders() {
  const [data, setData] = useState<{ items: ReviewItem[]; total: number }>({ items: [], total: 0 });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/teach-me/review')
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as { total?: unknown };
        const items = parseReviewItems(body);
        if (!cancelled) setData({ items, total: typeof body.total === 'number' ? Math.max(body.total, items.length) : items.length });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return <ReviewList items={data.items} total={data.total} />;
}
