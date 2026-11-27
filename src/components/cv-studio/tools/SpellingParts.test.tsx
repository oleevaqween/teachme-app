import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CheckFinding } from '@/lib/cv-studio/cv-checker';
import { OwnWords, ProofreadResults, SpellingStatus, SpellingVariantSwitch, SpellingWords } from './SpellingParts';

const noop = () => {};
const finding = (id: string): CheckFinding => ({ id, category: 'clarity', level: 'fix', title: 't', detail: 'd', target: 'summary', pointsLost: 2,
  words: [{ word: 'managment', suggestions: ['management', 'managements'], target: 'summary', where: 'Summary' }, { word: 'Zentrix', suggestions: [], target: 'experience', where: 'Experience · Analyst' }] });

describe('spelling parts of the CV checker', () => {
  it('shows the British and American choice with the current one checked', () => {
    const html = renderToStaticMarkup(<SpellingVariantSwitch value="en-GB" onChange={noop} />);
    expect(html).toContain('British English');
    expect(html).toContain('American English');
    // React 19 prints checked before value, so the checked radio reads checked="" value="...".
    expect(html).toMatch(/checked="" value="en-GB"/);
    expect(html).not.toMatch(/checked="" value="en-US"/);
  });
  it('says when spelling is still being checked or could not be checked', () => {
    expect(renderToStaticMarkup(<SpellingStatus status="pending" />)).toContain('Checking spelling…');
    expect(renderToStaticMarkup(<SpellingStatus status="failed" />)).toContain("Your score isn&#x27;t affected");
    expect(renderToStaticMarkup(<SpellingStatus status="done" />)).toBe('');
  });
  it('lists each word with its suggestions, where it is, Go to, and Add to my words when offered', () => {
    const html = renderToStaticMarkup(<SpellingWords finding={finding('spelling.words')} onGo={noop} onAdd={noop} />);
    expect(html).toContain('managment');
    expect(html).toContain('→ management, managements');
    expect(html).toContain('no suggestions');
    expect(html).toContain('Experience · Analyst');
    expect(html).toContain('Add to my words');
    expect(html).toContain('Go to');
    expect(renderToStaticMarkup(<SpellingWords finding={finding('spelling.variant')} onGo={noop} />)).not.toContain('Add to my words');
  });
  it('gives each word button a name that says which word or place it is for', () => {
    const html = renderToStaticMarkup(<SpellingWords finding={finding('spelling.words')} onGo={noop} onAdd={noop} />);
    expect(html).toContain('aria-label="Go to Summary"');
    expect(html).toContain('aria-label="Go to Experience · Analyst"');
    expect(html).toContain('aria-label="Add managment to my words"');
  });
  it('disables Add to my words and Remove while busy', () => {
    const words = renderToStaticMarkup(<SpellingWords finding={finding('spelling.words')} onGo={noop} onAdd={noop} disabled />);
    expect(words.match(/<button[^>]*aria-label="Add [^"]*"[^>]*disabled=""/g)).toHaveLength(2);
    const own = renderToStaticMarkup(<OwnWords words={['Zentrix']} onRemove={noop} disabled />);
    expect(own).toMatch(/<button[^>]*aria-label="Remove Zentrix from my words"[^>]*disabled=""/);
    expect(renderToStaticMarkup(<OwnWords words={['Zentrix']} onRemove={noop} />)).not.toContain('disabled');
  });
  it('lists my words with a remove button for each', () => {
    const html = renderToStaticMarkup(<OwnWords words={['Zentrix', 'Zolavi']} onRemove={noop} />);
    expect(html).toContain('My words (2)');
    expect(html).toContain('aria-label="Remove Zentrix from my words"');
    expect(renderToStaticMarkup(<OwnWords words={[]} onRemove={noop} />)).toBe('');
  });
});

describe('proofread results', () => {
  const suggestion = { id: 'summary#0', field: 'summary', label: 'Summary', target: 'summary' as const, before: 'Project manager supporting teams.', after: 'Project manager who supports teams.', reason: 'Reads more clearly' };
  it('shows each fix beside the original with Apply and Dismiss', () => {
    const html = renderToStaticMarkup(<ProofreadResults ran suggestions={[suggestion]} dropped={2} busy={false} onApply={noop} onDismiss={noop} />);
    for (const text of ['Summary', 'Project manager supporting teams.', 'Project manager who supports teams.', 'Reads more clearly', 'Apply', 'Dismiss']) expect(html).toContain(text);
    expect(html).toContain('2 suggestions were left out because they changed facts or broke your writing rules.');
  });
  it('names each button by its fix and announces results politely', () => {
    const html = renderToStaticMarkup(<ProofreadResults ran suggestions={[suggestion]} dropped={0} busy={false} onApply={noop} onDismiss={noop} />);
    expect(html).toContain('aria-label="Apply fix to Summary"');
    expect(html).toContain('aria-label="Dismiss fix to Summary"');
    expect(html).toContain('aria-live="polite"');
  });
  it('says when nothing needed fixing, and shows nothing before the first run', () => {
    expect(renderToStaticMarkup(<ProofreadResults ran suggestions={[]} dropped={0} busy={false} onApply={noop} onDismiss={noop} />)).toContain('No fixes suggested.');
    expect(renderToStaticMarkup(<ProofreadResults ran={false} suggestions={[]} dropped={0} busy={false} onApply={noop} onDismiss={noop} />)).toBe('');
  });
});
