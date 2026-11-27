import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { fixture } from '@/lib/cv-studio/test-fixture';
import { improveItems } from '@/lib/cv-studio/improve-rules';
import { DefendList, ImproveItems, ImproveQuestions, ImproveSuggestionCard } from './ImprovePanel';

const noop = () => {};

describe('Improve my CV screen', () => {
  it('lists each part of the CV with its reason', () => {
    const html = renderToStaticMarkup(<ImproveItems items={improveItems(fixture().resume)} selected="" onSelect={noop} />);
    expect(html).toContain('Project Manager · Example Ltd');
    expect(html).toContain('Looks solid; you can still sharpen it.');
    expect(html).toContain('Headline');
  });
  it('shows questions with Exact, Approximate and No number choices and a skip', () => {
    const html = renderToStaticMarkup(<ImproveQuestions target="experience.e1" answers={[]} questions={[{ bullet: 'Prepared monthly reports for 4 stakeholders.', question: 'Who used them?', why: 'Adds the result.' }]} fallback={false} busy={false} onAnswer={noop} />);
    expect(html).toContain('Who used them?');
    expect(html).toContain('Prepared monthly reports for 4 stakeholders.');
    for (const label of ['Exact', 'Approximate', 'No number', 'Skip']) expect(html).toContain(label);
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*>Skip/);
    expect(html).toContain('Pick Approximate if your answer is an estimate');
  });
  it('shows a suggestion side by side with its flags, warnings and actions', () => {
    const html = renderToStaticMarkup(<ImproveSuggestionCard busy={false} onAccept={noop} onReject={noop} suggestion={{
      id: 'x', field: 'experience.e1.achievements', line: 1, before: 'Assisted with reports', after: 'Led reports for 4 teams', reason: 'Adds scale',
      sources: [], flags: ['Claims more ownership: the original says "Assisted", the suggestion says "Led". Check this is accurate.'], warnings: ['Avoid "robust": say it in plain words.'] }} />);
    expect(html).toContain('Assisted with reports');
    expect(html).toContain('Led reports for 4 teams');
    expect(html).toContain('Claims more ownership');
    expect(html).toContain('Avoid &quot;robust&quot;');
    for (const label of ['Accept', 'Edit', 'Reject']) expect(html).toContain(label);
  });
  it('shows the sources of a suggestion with readable labels and truncated quotes', () => {
    const long = 'q'.repeat(200);
    const html = renderToStaticMarkup(<ImproveSuggestionCard busy={false} onAccept={noop} onReject={noop} suggestion={{
      id: 'x', field: 'projects', line: 0, before: 'a', after: 'b', reason: 'r', flags: [], warnings: [],
      sources: [{ source: 'improve.a1', quote: 'About 20 vendors' }, { source: 'experience.e1', quote: long }, { source: 'summary', quote: 'Seasoned' }] }} />);
    expect(html).toContain('Based on:');
    expect(html).toContain('Your answer');
    expect(html).toContain('This role');
    expect(html).toContain('Your CV');
    expect(html).toContain('“About 20 vendors”');
    expect(html).not.toContain('q'.repeat(161));
  });
  it('shows earlier saved answers that are not among the current questions', () => {
    const saved = { id: 'old', target: 'experience.e1', bullet: '', question: 'Who used the reports?', answer: 'The finance team', number: 'none' as const, status: 'answered' as const };
    const html = renderToStaticMarkup(<ImproveQuestions target="experience.e1" answers={[saved, { ...saved, id: 'other', target: 'projects', question: 'Other part?' }]} questions={[]} fallback={false} busy={false} onAnswer={noop} />);
    expect(html).toContain('Who used the reports?');
    expect(html).toContain('The finance team');
    expect(html).not.toContain('Other part?');
  });
  it('lists each bullet with a Practise defending this button', () => {
    const html = renderToStaticMarkup(<DefendList bullets={['Managed a budget of ₦2,000,000.', 'Prepared monthly reports for 4 stakeholders.']} busy={false} onDefend={noop} />);
    expect(html).toContain('Defend it in interview');
    expect(html).toContain('aria-label="Practise defending this: Managed a budget of ₦2,000,000."');
    expect(html.match(/Practise defending this<\/button>/g)).toHaveLength(2);
    expect(renderToStaticMarkup(<DefendList bullets={[]} busy={false} onDefend={noop} />)).toBe('');
  });
});
