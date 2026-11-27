'use client';

import { SourceLabel } from './SourceLabel';
import { LessonMarkdown } from './LessonMarkdown';
import { messageChips } from '@/lib/teaching-session-engine/citations';
import type { MessageSource } from '@/lib/teaching-session-engine/shared';

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  sources?: MessageSource[];
  createdAt?: Date;
}

/**
 * Renders a single message in a chat-like interface.
 * User messages are aligned right, assistant messages are aligned left.
 * Assistant messages use the shared reading styles for Markdown.
 * Citations are extracted and rendered as SourceLabel badges.
 */
export function MessageBubble({ role, content, sources, createdAt }: MessageBubbleProps) {
  const isUser = role === 'user';

  // Assistant replies: citation markers become chips (saved sources first, then inline ones)
  const { content: cleanedContent, chips } = !isUser
    ? messageChips(content, sources)
    : { content, chips: [] };

  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={
          isUser
            ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-gradient-to-br from-primary to-primary/90 px-4 py-3 text-primary-foreground shadow-sm'
            : 'w-full rounded-2xl rounded-bl-sm border border-border/60 bg-card px-5 py-4 text-foreground shadow-sm sm:px-6'
        }
      >
        {/* Message content */}
        {isUser ? (
          <div className="whitespace-pre-wrap break-words text-body leading-relaxed">
            {content}
          </div>
        ) : (
          <LessonMarkdown variant="reply" content={cleanedContent} />
        )}

        {/* Timestamp */}
        {createdAt && (
          <div
            className={`mt-2 text-caption ${
              isUser ? 'text-primary-foreground/70' : 'text-muted-foreground'
            }`}
          >
            {formatTime(createdAt)}
          </div>
        )}

        {/* Source attributions for assistant messages */}
        {!isUser && chips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/40 pt-2.5">
            {chips.map((chip, index) => (
              <SourceLabel key={`${chip.kind}-${index}`} chip={chip} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Formats a Date into a short time string (e.g., "2:30 PM").
 */
function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}
