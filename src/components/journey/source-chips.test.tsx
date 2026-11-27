import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SourceLabel } from './SourceLabel';
import { MessageBubble } from './MessageBubble';
import { LessonCard } from './LessonCard';
import { StageSources } from './StageSources';

describe('source chips', () => {
  it('labels a document as Your document, with the full name in the tooltip', () => {
    const html = renderToStaticMarkup(<SourceLabel chip={{ kind: 'document', name: 'Project-handbook-2026-final.pdf' }} />);
    expect(html).toContain('title="Project-handbook-2026-final.pdf"');
    expect(html).toContain('Your document: Project-handbook-2026-final.pdf');
  });

  it('links a web source only when it has a real address', () => {
    const linked = renderToStaticMarkup(<SourceLabel chip={{ kind: 'web', name: 'RACI guide', url: 'https://example.com/raci' }} />);
    expect(linked).toContain('href="https://example.com/raci"');
    const plain = renderToStaticMarkup(<SourceLabel chip={{ kind: 'web', name: 'Wikipedia' }} />);
    expect(plain).not.toContain('<a');
    expect(plain).toContain('Wikipedia');
    const bad = renderToStaticMarkup(<SourceLabel chip={{ kind: 'web', name: 'Odd', url: 'Odd' }} />);
    expect(bad).not.toContain('href=');
  });

  it('shows a grey General knowledge chip', () => {
    const html = renderToStaticMarkup(<SourceLabel chip={{ kind: 'general' }} />);
    expect(html).toContain('General knowledge');
    expect(html).toContain('bg-muted');
  });
});

describe('chips on messages', () => {
  it('fixes the inline web citation: no link made from its name', () => {
    const html = renderToStaticMarkup(<MessageBubble role="assistant" content="As stated [Web: Wikipedia] here." />);
    expect(html).toContain('Wikipedia');
    expect(html).not.toContain('href="Wikipedia"');
    expect(html).not.toContain('[Web:');
  });

  it('moves [General Knowledge] out of the reply text into a chip', () => {
    const html = renderToStaticMarkup(
      <LessonCard content="Gantt charts show time [General Knowledge]." sources={[{ type: 'document', name: 'plan.pdf' }]} />
    );
    expect(html).not.toContain('[General Knowledge]');
    expect(html).toContain('Gantt charts show time.');
    expect(html).toContain('General knowledge');
    expect(html).toContain('Your document: plan.pdf');
  });

  it('leaves a learner message as typed, with no chips', () => {
    const html = renderToStaticMarkup(<MessageBubble role="user" content="What is [General Knowledge]?" />);
    expect(html).toContain('What is [General Knowledge]?');
    expect(html).not.toContain('General knowledge<');
  });
});

describe('sources for this stage', () => {
  it('lists documents with their sections and web material by title, as a plain list', () => {
    const html = renderToStaticMarkup(
      <StageSources sources={{ documents: [{ name: 'plan.pdf', sections: ['Scope', 'Risks'] }], web: [{ title: 'What is a RACI chart?' }] }} />
    );
    expect(html).toMatch(/^<ul/);
    expect(html).not.toContain('<details');
    expect(html).not.toContain('<summary');
    expect(html).toContain('Your document: plan.pdf');
    expect(html).toContain('Scope · Risks');
    expect(html).toContain('What is a RACI chart?');
    expect(html).not.toContain('href=');
  });

  it('tidies section headings the same way as stage topics, in a labelled list that leaves scrolling to the popup', () => {
    const html = renderToStaticMarkup(
      <StageSources
        sources={{
          documents: [{ name: 'pmbok.pdf', sections: ['2.1.2 INFORMATION FLOW', 'Section 4', 'TEAM PERFORMANCE DOMAIN'] }],
          web: [],
        }}
      />
    );
    expect(html).toContain('2.1.2 Information Flow · Team Performance Domain');
    expect(html).not.toContain('Section 4');
    expect(html).toContain('aria-label="Sources for this stage"');
    expect(html).not.toContain('max-h-48');
    expect(html).not.toContain('overflow-y-auto');
  });

  it('renders nothing for an empty list', () => {
    expect(renderToStaticMarkup(<StageSources sources={{ documents: [], web: [] }} />)).toBe('');
  });
});
