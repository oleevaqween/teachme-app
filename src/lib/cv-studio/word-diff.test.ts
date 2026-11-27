import { describe, expect, it } from 'vitest';
import { DIFF_CELL_LIMIT, editCheck, isFlagged, wordDiff, type DiffPart } from './edit-safety';
import type { Suggestion } from './schema';

const same = (text: string): DiffPart => ({ kind: 'same', text });
const removed = (text: string): DiffPart => ({ kind: 'removed', text });
const added = (text: string): DiffPart => ({ kind: 'added', text });

/** The words and line breaks of a text, as wordDiff reads them. */
const tokens = (text: string) => text.replace(/\r\n?/g, '\n').match(/\n|[^\s]+/g) ?? [];
/** The tokens of the parts of the given kinds, split back into single words. */
const rebuild = (parts: DiffPart[], kinds: DiffPart['kind'][]) =>
  parts.filter(p => kinds.includes(p.kind)).flatMap(p => (p.text === '\n' ? ['\n'] : p.text.split(' ')));
/** A plain longest-common-subsequence length, to check that wordDiff keeps as many words as possible. */
function lcsLength(a: string[], b: string[]): number {
  const row = new Array(b.length + 1).fill(0);
  for (const x of a) {
    let diagonal = 0;
    for (let j = 1; j <= b.length; j++) {
      const up = row[j];
      row[j] = x === b[j - 1] ? diagonal + 1 : Math.max(row[j], row[j - 1]);
      diagonal = up;
    }
  }
  return row[b.length];
}

describe('wordDiff', () => {
  it('shows identical text as one unchanged run', () => {
    expect(wordDiff('Led a team of 4.', 'Led a team of 4.')).toEqual([same('Led a team of 4.')]);
  });
  it('shows everything as added when the original is empty, and nothing for two empty texts', () => {
    expect(wordDiff('', 'Prepared monthly reports.')).toEqual([added('Prepared monthly reports.')]);
    expect(wordDiff('', '')).toEqual([]);
    expect(wordDiff('Prepared monthly reports.', '')).toEqual([removed('Prepared monthly reports.')]);
  });
  it('marks an insertion', () => {
    expect(wordDiff('Prepared monthly reports.', 'Prepared monthly board reports.')).toEqual([same('Prepared monthly'), added('board'), same('reports.')]);
  });
  it('marks a deletion', () => {
    expect(wordDiff('Prepared detailed monthly reports.', 'Prepared monthly reports.')).toEqual([same('Prepared'), removed('detailed'), same('monthly reports.')]);
  });
  it('marks a replacement as removed then added', () => {
    expect(wordDiff('Supported the finance team.', 'Led the finance team.')).toEqual([removed('Supported'), added('Led'), same('the finance team.')]);
  });
  it('keeps punctuation attached to its word', () => {
    expect(wordDiff('Managed vendors, budgets and reporting.', 'Managed vendors, budgets, and reporting.'))
      .toEqual([same('Managed vendors,'), removed('budgets'), added('budgets,'), same('and reporting.')]);
  });
  it('compares case-sensitively', () => {
    expect(wordDiff('project manager', 'Project manager')).toEqual([removed('project'), added('Project'), same('manager')]);
  });
  it('handles repeated words', () => {
    expect(wordDiff('Led the team and the project.', 'Led the project.')).toEqual([same('Led the'), removed('team and the'), same('project.')]);
    expect(wordDiff('reports and reports', 'reports')).toEqual([same('reports'), removed('and reports')]);
  });
  it('keeps line breaks as their own parts', () => {
    expect(wordDiff('Led audits.\nCut costs.', 'Led audits.\nCut costs by 10%.'))
      .toEqual([same('Led audits.'), same('\n'), same('Cut'), removed('costs.'), added('costs by 10%.')]);
    expect(wordDiff('Led audits. Cut costs.', 'Led audits.\nCut costs.')).toEqual([same('Led audits.'), added('\n'), same('Cut costs.')]);
    expect(wordDiff('Led audits.\nCut costs.', 'Led audits. Cut costs.')).toEqual([same('Led audits.'), removed('\n'), same('Cut costs.')]);
    expect(wordDiff('a\n\nb', 'a\n\nb')).toEqual([same('a'), same('\n'), same('\n'), same('b')]);
  });
  it('treats spaces and tabs as separators and "\\r\\n" as one line break', () => {
    expect(wordDiff('Led  the\tteam', 'Led the team')).toEqual([same('Led the team')]);
    expect(wordDiff('a\r\nb', 'a\nb')).toEqual([same('a'), same('\n'), same('b')]);
  });
  it('rebuilds both texts and keeps as many words as possible on varied inputs', () => {
    const words = ['Led', 'led', 'the', 'team', 'team.', '4', '\n', 'reports,', 'and', 'monthly'];
    let seed = 7;
    const next = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed; };
    const text = () => Array.from({ length: next() % 12 }, () => words[next() % words.length]).join(' ');
    for (let n = 0; n < 300; n++) {
      const before = text(), after = text(), parts = wordDiff(before, after);
      expect(rebuild(parts, ['same', 'removed'])).toEqual(tokens(before));
      expect(rebuild(parts, ['same', 'added'])).toEqual(tokens(after));
      expect(rebuild(parts, ['same']).length).toBe(lcsLength(tokens(before), tokens(after)));
    }
  });
  it('shows a very large changed middle as removed then added, keeping the unchanged ends', () => {
    const many = (prefix: string) => Array.from({ length: 600 }, (_, i) => prefix + i).join(' ');
    expect(600 * 600).toBeGreaterThan(DIFF_CELL_LIMIT);
    const parts = wordDiff('Start ' + many('a') + ' End.', 'Start ' + many('b') + ' End.');
    expect(parts.map(p => p.kind)).toEqual(['same', 'removed', 'added', 'same']);
    expect(parts[0].text).toBe('Start');
    expect(parts[3].text).toBe('End.');
  });
});

describe('editCheck and isFlagged', () => {
  const s = (after: string): Suggestion => ({ id: 's1', target: 'summary', before: 'Supported the finance team.', after, reason: '', status: 'pending', evidence: [{ source: 'summary', quote: 'Supported the finance team.' }] });
  it('returns the flags and the changes together', () => {
    expect(editCheck(s('Led the finance team.'))).toEqual({
      flags: ['Claims more ownership: the original says "Supported", the suggestion says "Led". Check this is accurate.'],
      changes: [removed('Supported'), added('Led'), same('the finance team.')],
    });
    expect(isFlagged(s('Led the finance team.'))).toBe(true);
    expect(isFlagged(s('Supported the finance team with month-end close.'))).toBe(false);
  });
  it('returns null for damaged saved data, which counts as flagged', () => {
    const damaged = s(undefined as unknown as string);
    expect(editCheck(damaged)).toBeNull();
    expect(isFlagged(damaged)).toBe(true);
    expect(editCheck({ ...s('Led the finance team.'), evidence: null as unknown as Suggestion['evidence'] })).toBeNull();
  });
});
