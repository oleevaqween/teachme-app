import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { focusAfterAction, TermGapControls, type TermGapActions } from './JobMatch';

const noop = () => {};
const actions: TermGapActions = { have: noop, lack: noop, undo: noop, open: noop, learn: noop };
const render = (status: Parameters<typeof TermGapControls>[0]['status']) =>
  renderToStaticMarkup(<TermGapControls term="Power BI" importance="essential" status={status} actions={actions} />);

describe('keyword gap controls', () => {
  it('offers both choices for an open term, with the term in each label', () => {
    const html = render({ kind: 'open' });
    expect(html).toContain('aria-label="I have this: Power BI"');
    expect(html).toContain('aria-label="I don&#x27;t have this yet: Power BI"');
    expect(html).not.toContain('Skipped.');
  });
  it('shows skipped with both choices again', () => {
    const html = render({ kind: 'skipped', answerId: 'a1' });
    expect(html).toContain('Skipped.');
    expect(html).toContain('I have this');
  });
  it('shows a waiting or answered question with Open', () => {
    expect(render({ kind: 'waiting', answerId: 'a1' })).toContain('Question waiting in your evidence guide.');
    const answered = render({ kind: 'answered', answerId: 'a1' });
    expect(answered).toContain('Answered. After you refresh the analysis, tailoring can use it.');
    expect(answered).toContain('aria-label="Open: Power BI"');
    expect(answered).not.toContain('I have this');
  });
  it('shows a term the user does not have yet with a learning link and Undo', () => {
    const html = render({ kind: 'not-held' });
    expect(html).toContain('You said you don&#x27;t have this yet.');
    expect(html).toContain('href="/teach-me"');
    expect(html).toContain('Learn it in Teach Me');
    expect(html).toContain('aria-label="Undo: Power BI"');
  });
  it('announces changes politely', () => {
    expect(render({ kind: 'open' })).toContain('aria-live="polite"');
    expect(render({ kind: 'open' })).toContain('class="term-gap"');
  });
});

describe('keyword gap controls while busy and after an action', () => {
  const notHeld = (busy?: boolean) => renderToStaticMarkup(<TermGapControls term="Power BI" importance="essential" status={{ kind: 'not-held' }} actions={actions} busy={busy} />);

  it('shows the learning link as plain, disabled text while TeachMe is busy', () => {
    const html = notHeld(true);
    expect(html).not.toContain('<a');
    expect(html).not.toContain('href=');
    expect(html).toContain('<span aria-disabled="true">Learn it in Teach Me</span>');
    expect(html).toContain('aria-label="Undo: Power BI"');
  });

  it('puts the learning link first after marking a term, so it takes focus', () => {
    const html = notHeld();
    expect(html.indexOf('<a')).toBeGreaterThan(-1);
    expect(html.indexOf('<a')).toBeLessThan(html.indexOf('<button'));
    expect(html).toContain('aria-label="Learn it in Teach Me: Power BI"');
  });

  it('moves focus to the first control only after a user action, once', () => {
    const focus = vi.fn();
    const selectors: string[] = [];
    const root = { querySelector: (selector: string) => { selectors.push(selector); return { focus }; } } as unknown as Pick<ParentNode, 'querySelector'>;
    const acted = { current: false };
    expect(focusAfterAction(acted, root)).toBe(false);
    expect(focus).not.toHaveBeenCalled();
    acted.current = true;
    expect(focusAfterAction(acted, root)).toBe(true);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(selectors).toEqual(['button, a']);
    expect(acted.current).toBe(false);
    expect(focusAfterAction(acted, null)).toBe(false);
  });
});
