'use client';

import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

const components: Components = {
  // Wide tables scroll inside their own frame instead of stretching the page.
  table: ({ node, ...props }) => {
    void node;
    return (
      <div className="reading-table">
        <table {...props} />
      </div>
    );
  },
};

/**
 * Renders lesson or reply Markdown with the Teach Me reading styles
 * (.reading-lesson / .reading-reply in globals.css).
 */
export function LessonMarkdown({
  content,
  variant,
  className,
}: {
  content: string;
  variant: 'lesson' | 'reply';
  className?: string;
}) {
  return (
    <div className={cn('prose reading', variant === 'lesson' ? 'reading-lesson' : 'reading-reply', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
