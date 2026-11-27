'use client';

import { BookOpen } from 'lucide-react';
import { SourceLabel } from './SourceLabel';
import { LessonMarkdown } from './LessonMarkdown';
import { messageChips } from '@/lib/teaching-session-engine/citations';
import type { MessageSource } from '@/lib/teaching-session-engine/shared';

interface LessonCardProps {
  content: string;
  sources?: MessageSource[];
  createdAt?: Date;
}

/** A lesson, laid out as a page to read rather than a chat message. */
export function LessonCard({ content, sources, createdAt }: LessonCardProps) {
  const { content: cleanedContent, chips } = messageChips(content, sources);

  return (
    <article className="w-full rounded-2xl border border-border/60 bg-card shadow-sm">
      <header className="flex items-center gap-2 px-6 pt-5 sm:px-10 sm:pt-7">
        <BookOpen className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="text-label font-semibold uppercase tracking-[0.18em] text-primary">Lesson</span>
        {createdAt && (
          <span className="ml-auto text-caption text-muted-foreground">
            {createdAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
          </span>
        )}
      </header>

      <div className="px-6 pb-7 pt-4 sm:px-10 sm:pb-9">
        <LessonMarkdown variant="lesson" content={cleanedContent} />
      </div>

      {chips.length > 0 && (
        <footer className="flex flex-wrap items-center gap-1.5 rounded-b-2xl border-t border-border/50 bg-muted/20 px-6 py-3 sm:px-10">
          <span className="mr-1 text-caption text-muted-foreground">Sources</span>
          {chips.map((chip, index) => (
            <SourceLabel key={`${chip.kind}-${index}`} chip={chip} />
          ))}
        </footer>
      )}
    </article>
  );
}
