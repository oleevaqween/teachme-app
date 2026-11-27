import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LessonActionButtons } from './LessonActions';
import { lessonMessage } from './lesson-message';

const noop = () => {};
const ids = { journeyId: 'j1', stageId: 's1', messageId: 'm1' };
const buttons = (html: string) => html.match(/<button[^>]*>[^<]*<\/button>/g) ?? [];

describe('lesson buttons', () => {
  it('shows the five buttons in order', () => {
    const html = renderToStaticMarkup(<LessonActionButtons disabled={false} onAction={noop} />);
    expect(buttons(html).map((b) => b.replace(/<[^>]+>/g, ''))).toEqual([
      'Simpler', 'Give an example', 'Step by step', 'How it applies at work', 'Check my understanding',
    ]);
    expect(html).toContain('aria-label="Lesson help"');
    expect(html).not.toContain('disabled=""');
  });

  it('disables every button while a reply is streaming', () => {
    const html = renderToStaticMarkup(<LessonActionButtons disabled onAction={noop} />);
    expect(buttons(html)).toHaveLength(5);
    expect(buttons(html).every((b) => b.includes('disabled=""'))).toBe(true);
  });

  it('renders an end node after the five chips, outside the help group', () => {
    const html = renderToStaticMarkup(
      <LessonActionButtons disabled={false} onAction={noop} end={<button type="button">Complete Stage</button>} />
    );
    const groupStart = html.indexOf('role="group"');
    const groupEnd = html.indexOf('</div>', groupStart);
    const group = html.slice(groupStart, groupEnd);
    expect(group).toContain('Check my understanding');
    expect(group).not.toContain('Complete Stage');
    expect(html.indexOf('Complete Stage')).toBeGreaterThan(groupEnd);
    expect(html).toContain('ml-auto');
    expect(html.endsWith('</div></div>')).toBe(true);
  });

  it('renders no end wrapper when there is no end node', () => {
    expect(renderToStaticMarkup(<LessonActionButtons disabled={false} onAction={noop} />)).not.toContain('ml-auto');
  });
});

describe('lesson sends', () => {
  it('sends a typed message as today, trimmed, with no action', () => {
    expect(lessonMessage(ids, '  What is RACI?  ')).toEqual({
      message: 'What is RACI?',
      body: { ...ids, message: 'What is RACI?' },
    });
    expect(lessonMessage(ids, '   ')).toBeNull();
  });

  it('sends a button as its visible line with the action, ignoring typed text', () => {
    expect(lessonMessage(ids, 'half a question', 'simpler')).toEqual({
      message: 'Explain that more simply.',
      body: { ...ids, message: 'Explain that more simply.', action: 'simpler' },
    });
  });

  it('passes the role only for work, and only when known', () => {
    expect(lessonMessage(ids, '', 'work', 'Project Manager')).toEqual({
      message: 'How does this apply at work, for a Project Manager role?',
      body: { ...ids, message: 'How does this apply at work, for a Project Manager role?', action: 'work', role: 'Project Manager' },
    });
    expect(lessonMessage(ids, '', 'work', '')?.body).toEqual({ ...ids, message: 'How does this apply at work?', action: 'work' });
    expect(lessonMessage(ids, '', 'check', 'Project Manager')?.body).toEqual({ ...ids, message: 'Check my understanding.', action: 'check' });
  });

  it('sends a typed button line exactly as if the button were pressed', () => {
    expect(lessonMessage(ids, ' check my understanding ')).toEqual({
      message: 'Check my understanding.',
      body: { ...ids, message: 'Check my understanding.', action: 'check' },
    });
    expect(lessonMessage(ids, 'How does this apply at work?', undefined, 'Project Manager')?.body).toEqual({
      ...ids, message: 'How does this apply at work, for a Project Manager role?', action: 'work', role: 'Project Manager',
    });
    expect(lessonMessage(ids, 'How does this apply at work, for a Nurse role?', undefined, 'Project Manager')?.body).toEqual({
      ...ids, message: 'How does this apply at work, for a Nurse role?', action: 'work', role: 'Nurse',
    });
  });
});
