'use client';

import { useMemo } from 'react';
import { displayTopics } from '@/lib/teaching-session-engine/topic-display';

/** How many topics a stage has once tidied for reading (placeholders dropped). */
export function topicCount(topics: readonly string[]): number {
  return displayTopics(topics).length;
}

/**
 * The stage's topics as small labels, tidied for reading, all shown (they live in
 * a popup). Renders nothing when no topic is left.
 */
export function StageTopics({ topics }: { topics: readonly string[] }) {
  const items = useMemo(() => displayTopics(topics), [topics]);
  if (items.length === 0) return null;

  return (
    <ul className="flex flex-wrap items-center gap-1.5" aria-label="Topics in this stage">
      {items.map((topic) => (
        <li
          key={`${topic.number ?? ''}|${topic.name}`}
          className="inline-flex max-w-full items-start gap-1.5 rounded-full border border-border/70 bg-muted/40 px-2.5 py-0.5 text-caption leading-4 text-foreground/85"
        >
          {topic.number && (
            <span className="shrink-0 tabular-nums text-muted-foreground">{topic.number}</span>
          )}
          <span className="min-w-0 break-words">{topic.name}</span>
        </li>
      ))}
    </ul>
  );
}
