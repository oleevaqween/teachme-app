import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StageNotes, noteStatusLine } from './StageNotes';
import { MAX_NOTE_LENGTH, NOTES_UNAVAILABLE_MESSAGE } from '@/lib/teaching-session-engine/stage-note';

const noop = () => {};
const render = (props: Partial<Parameters<typeof StageNotes>[0]> = {}) =>
  renderToStaticMarkup(
    <StageNotes text="" status="idle" onChange={noop} onRetrySave={noop} onReload={noop} {...props} />
  );

describe('StageNotes', () => {
  it('shows a labelled notes box with the saved text and a character limit', () => {
    const html = render({ text: 'Scope comes first.' });
    expect(html).toContain('aria-label="Your notes for this stage"');
    expect(html).toContain('Scope comes first.');
    expect(html).toContain(`maxLength="${MAX_NOTE_LENGTH}"`);
    expect(html).not.toContain('disabled=""');
  });

  it('tells the learner notes save as they type and survive a reset', () => {
    expect(render()).toContain('Saved as you type. Kept when you reset the conversation.');
  });

  it('keeps editing off until the saved note has loaded', () => {
    expect(render({ status: 'loading' })).toContain('disabled=""');
    const failed = render({ status: 'load-error' });
    expect(failed).toContain('disabled=""');
    expect(failed).toContain("Couldn&#x27;t load your notes.");
    expect(failed).toContain('Try again');
  });

  it('offers to save again after a failed save, keeping the text editable', () => {
    const html = render({ status: 'error', text: 'unsaved words' });
    expect(html).toContain('unsaved words');
    expect(html).toContain('Try again');
    expect(html).not.toContain('disabled=""');
  });

  it('explains the database update when notes are unavailable', () => {
    const html = render({ status: 'unavailable' });
    expect(html).toContain('npm run db:setup');
    expect(html).toContain('disabled=""');
  });

  it('shows a counter only near the limit', () => {
    expect(render({ text: 'a'.repeat(100) })).not.toContain('/ 10,000');
    expect(render({ text: 'a'.repeat(9_500) })).toContain('9,500 / 10,000');
  });

  it('announces save status politely', () => {
    expect(render()).toContain('aria-live="polite"');
  });
});

describe('noteStatusLine', () => {
  it('has a line for every status', () => {
    expect(noteStatusLine('loading')).toBe('Loading your notes…');
    expect(noteStatusLine('pending')).toBe('Saving…');
    expect(noteStatusLine('saved')).toBe('All changes saved.');
    expect(noteStatusLine('error')).toBe("Couldn't save just now. Your text is still here.");
    expect(noteStatusLine('unavailable')).toBe(NOTES_UNAVAILABLE_MESSAGE);
  });
});
