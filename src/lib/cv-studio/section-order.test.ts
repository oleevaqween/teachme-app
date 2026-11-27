import { describe, expect, it } from 'vitest';
import { coreSectionKeys } from './sections';
import { moveSection, type SectionKey } from './section-order';

const order = [...coreSectionKeys] as SectionKey[];

describe('moveSection', () => {
  it('moves one section and keeps every section exactly once', () => {
    const next = moveSection(order, 0, 3);
    expect(next).toEqual(['experience', 'projects', 'education', 'summary', 'skills', 'certifications', 'additional']);
    expect([...next].sort()).toEqual([...order].sort());
  });

  it('moves a section upwards', () => {
    expect(moveSection(order, 4, 1)).toEqual(['summary', 'skills', 'experience', 'projects', 'education', 'certifications', 'additional']);
  });

  it('returns an unchanged copy for no-op or out-of-range moves', () => {
    for (const [from, to] of [[2, 2], [-1, 2], [2, 7], [7, 0], [0, -1]]) {
      const next = moveSection(order, from, to);
      expect(next).toEqual(order);
      expect(next).not.toBe(order);
    }
  });

  it('never mutates the input', () => {
    const input = [...order];
    moveSection(input, 0, 6);
    expect(input).toEqual(order);
  });
});
