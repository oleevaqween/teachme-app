import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { LessonActionButtons } from './LessonActions';
import { messageElementId, startOfLatestReply } from './lesson-scroll';
import { LessonMarkdown } from './LessonMarkdown';
import { LessonCard } from './LessonCard';
import { MessageBubble } from './MessageBubble';
import { StageTopics } from './StageTopics';
import { LESSON_PAGE, READING_COLUMN } from './reading-width';

describe('where a stage resumes', () => {
  it('starts at the newest reply, not the bottom of the page', () => {
    expect(
      startOfLatestReply([
        { id: 'a', role: 'assistant' },
        { id: 'b', role: 'user' },
        { id: 'c', role: 'assistant' },
        { id: 'd', role: 'user' },
      ])
    ).toBe('c');
  });

  it('falls back to the newest message, or nothing', () => {
    expect(startOfLatestReply([{ id: 'u', role: 'user' }])).toBe('u');
    expect(startOfLatestReply([])).toBeNull();
  });

  it('gives each message a stable element id', () => {
    expect(messageElementId('abc')).toBe('message-abc');
  });
});

describe('lesson text', () => {
  it('uses the lesson reading style for lessons and the reply style for replies', () => {
    expect(renderToStaticMarkup(<LessonMarkdown variant="lesson" content="Hi" />)).toContain('prose reading reading-lesson');
    expect(renderToStaticMarkup(<LessonMarkdown variant="reply" content="Hi" />)).toContain('prose reading reading-reply');
  });

  it('puts tables in a scrolling frame', () => {
    const html = renderToStaticMarkup(
      <LessonMarkdown variant="reply" content={'| A | B |\n|---|---|\n| 1 | 2 |'} />
    );
    expect(html).toMatch(/<div class="reading-table"><table>/);
    expect(html).toContain('<td>1</td>');
  });

  it('renders a lesson with section headings and no stray space before punctuation', () => {
    const html = renderToStaticMarkup(
      <LessonCard content={'### Small Crews\n\nFrom the guide [Document: guide.pdf]: three to nine.'} />
    );
    expect(html).toContain('<h3>Small Crews</h3>');
    expect(html).toContain('From the guide: three to nine.');
    expect(html).toContain('Your document: guide.pdf');
  });

  it('lets a reply card use the full reading column', () => {
    const html = renderToStaticMarkup(<MessageBubble role="assistant" content="Hi" />);
    expect(html).toContain('w-full');
    expect(html).not.toMatch(/max-w-\[\d+%\]/);
  });

  it('uses the very wide reading column the user chose (page 1280px, column 1152px)', () => {
    expect(LESSON_PAGE).toContain('max-w-7xl');
    expect(LESSON_PAGE).toContain('px-(--space-page-inline)');
    expect(READING_COLUMN).toContain('max-w-6xl');
  });

  it('keeps the user message as plain text', () => {
    const html = renderToStaticMarkup(<MessageBubble role="user" content={'**not bold**'} />);
    expect(html).toContain('**not bold**');
    expect(html).not.toContain('reading-reply');
  });
});

describe('stage topics', () => {
  const raw = [
    'TEAM PERFORMANCE DOMAIN',
    '2.2.1 PROJECT TEAM MANAGEMENT AND LEADERSHIP',
    'Section 94',
    '2.2.2 PROJECT TEAM CULTURE',
    '2.2.3 HIGH-PERFORMING PROJECT TEAMS',
    '2.2.4 LEADERSHIP SKILLS',
  ];

  it('shows every tidied topic with its number, with no more button', () => {
    const html = renderToStaticMarkup(<StageTopics topics={raw} />);
    expect(html).toContain('Team Performance Domain');
    expect(html).toContain('2.2.1');
    expect(html).toContain('Project Team Management and Leadership');
    expect(html).toContain('Project Team Culture');
    expect(html).toContain('High-Performing Project Teams');
    expect(html).toContain('Leadership Skills');
    expect(html).not.toContain('Section 94');
    expect(html).not.toContain('more');
    expect(html).not.toContain('<button');
  });

  it('shows no "more" button when everything fits, and nothing at all when no topic is left', () => {
    expect(renderToStaticMarkup(<StageTopics topics={['DEFINE SCOPE']} />)).not.toContain('more');
    expect(renderToStaticMarkup(<StageTopics topics={['Section 1', 'TABLE OF CONTENTS']} />)).toBe('');
  });
});

describe('compact lesson controls', () => {
  it('keeps the action chips short', () => {
    const html = renderToStaticMarkup(<LessonActionButtons disabled={false} onAction={() => {}} />);
    for (const c of ['py-0.5', 'leading-5', 'text-caption', 'sm:text-small']) expect(html).toContain(c);
    expect(html).not.toContain('py-1 ');
  });

  it('keeps the topic chips on a tight line height', () => {
    const html = renderToStaticMarkup(
      <StageTopics topics={['A ONE', 'B TWO', 'C THREE', 'D FOUR', 'E FIVE']} />
    );
    expect(html.match(/leading-4/g)?.length).toBeGreaterThanOrEqual(5);
  });

  it('gives the title its own row and puts the lesson tools on a row under it (option 5)', () => {
    const src = readFileSync('src/components/journey/TeachingSession.tsx', 'utf8');
    // Row 1: Back and the full-width title, never cut to one line; a very long title wraps to two.
    expect(src).toContain('data-header-row="title"');
    expect(src).toContain('title={stageTitle}');
    expect(src).not.toContain('sm:truncate');
    expect(src).toContain('line-clamp-2');
    // Row 2: the tools, lined up with the title, Reset at the end; popups open from their left edge.
    expect(src).toContain('data-header-row="tools"');
    expect(src).toContain('sm:pl-16');
    expect(src).toContain('align="start"');
    expect(src).toContain('<HeaderPopover');
    expect(src).not.toContain('CheckFirstPrompt');
    expect(src).not.toContain('Complete Stage button */}');
    expect(src).not.toContain('w-full items-center justify-center gap-2 rounded-lg');
    expect(src).toContain('end={');
    expect(src).toContain("bg-background px-4 py-2',");
  });
});
