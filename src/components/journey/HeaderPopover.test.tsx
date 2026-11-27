import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HeaderPopover, escapeShouldRefocus, popoverNextOpen } from './HeaderPopover';
import { StageTopics, topicCount } from './StageTopics';
import { StageSources, hasSources } from './StageSources';

describe('HeaderPopover alignment', () => {
  it('opens from the right edge by default and from the left edge with align="start"', () => {
    const end = renderToStaticMarkup(<HeaderPopover label="T" id="p" initialOpen><p>x</p></HeaderPopover>);
    expect(end).toContain('sm:right-0');
    const start = renderToStaticMarkup(<HeaderPopover label="T" id="p" align="start" initialOpen><p>x</p></HeaderPopover>);
    expect(start).toContain('sm:left-0');
    expect(start).not.toContain('sm:right-0');
  });
});

describe('HeaderPopover markup', () => {
  it('renders closed: a labelled button, aria-expanded false, no panel', () => {
    const html = renderToStaticMarkup(
      <HeaderPopover label="Topics" id="pop-a">
        <p>inside</p>
      </HeaderPopover>
    );
    expect(html).toContain('Topics');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="pop-a"');
    expect(html).not.toContain('id="pop-a"');
    expect(html).not.toContain('inside');
  });

  it('renders open: the panel with its id and the children', () => {
    const html = renderToStaticMarkup(
      <HeaderPopover label="Topics" id="pop-a" initialOpen>
        <p>inside</p>
      </HeaderPopover>
    );
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('id="pop-a"');
    expect(html).toContain('inside');
    for (const c of ['z-20', 'max-h-72', 'overflow-y-auto', 'bg-card', 'border-border']) {
      expect(html).toContain(c);
    }
  });
});

describe('popup alignment', () => {
  it('spans the header row on phones and opens leftwards from the button from sm up', () => {
    const html = renderToStaticMarkup(
      <HeaderPopover label="T" id="p" initialOpen>
        <p>x</p>
      </HeaderPopover>
    );
    expect(html).toContain('inset-x-4');
    expect(html).toContain('sm:right-0');
    expect(html).not.toContain('sm:left-0');
  });
});

describe('popoverNextOpen', () => {
  it('toggles on button click', () => {
    expect(popoverNextOpen(false, { type: 'toggle' })).toBe(true);
    expect(popoverNextOpen(true, { type: 'toggle' })).toBe(false);
  });

  it('closes on Escape and stays closed', () => {
    expect(popoverNextOpen(true, { type: 'escape' })).toBe(false);
    expect(popoverNextOpen(false, { type: 'escape' })).toBe(false);
  });

  it('closes on a pointerdown outside, but not inside', () => {
    expect(popoverNextOpen(true, { type: 'pointerdown', inside: false })).toBe(false);
    expect(popoverNextOpen(true, { type: 'pointerdown', inside: true })).toBe(true);
  });

  it('closes when another popover opens, but ignores its own announcement', () => {
    expect(popoverNextOpen(true, { type: 'other-opened', openedId: 'b', selfId: 'a' })).toBe(false);
    expect(popoverNextOpen(true, { type: 'other-opened', openedId: 'a', selfId: 'a' })).toBe(true);
  });
});

describe('escapeShouldRefocus', () => {
  it('returns focus to the button only when focus is inside the popover', () => {
    expect(escapeShouldRefocus(true)).toBe(true);
    expect(escapeShouldRefocus(false)).toBe(false);
  });
});

describe('StageTopics in a popup', () => {
  it('wraps a long topic name in full instead of truncating', () => {
    const name = 'Project Team Management and Leadership Skills for High-Performing Teams';
    const html = renderToStaticMarkup(<StageTopics topics={[name]} />);
    expect(html).not.toContain('truncate');
    expect(html).not.toContain('whitespace-nowrap');
    expect(html).toContain('break-words');
    expect(html).toContain(name);
  });

  it('renders every tidied topic with no more button', () => {
    const html = renderToStaticMarkup(
      <StageTopics topics={['A ONE', 'B TWO', 'C THREE', 'D FOUR', 'E FIVE']} />
    );
    expect(html.match(/<li/g)?.length).toBe(5);
    expect(html).not.toContain('<button');
    expect(html).not.toContain('more');
  });

  it('counts tidied topics only', () => {
    expect(topicCount(['TEAM PERFORMANCE DOMAIN', 'Section 94', '2.2.1 CULTURE'])).toBe(2);
    expect(topicCount([])).toBe(0);
  });
});

describe('StageSources in a popup', () => {
  const sources = { documents: [{ name: 'plan.pdf', sections: ['Scope'] }], web: [] };

  it('has no details wrapper', () => {
    const html = renderToStaticMarkup(<StageSources sources={sources} />);
    expect(html).not.toContain('<details');
    expect(html).not.toContain('<summary');
    expect(html).toContain('Your document: plan.pdf');
  });

  it('reports whether there is anything to show', () => {
    expect(hasSources({ documents: [], web: [] })).toBe(false);
    expect(hasSources(sources)).toBe(true);
    expect(hasSources({ documents: [], web: [{ title: 'x' }] })).toBe(true);
  });
});
