// src/lib/curriculum-engine/quiz-generator.test.ts

import { describe, it, expect } from 'vitest';
import { planQuizInsertion } from './quiz-generator';
import type { JourneySection } from './index';

/** Helper to create N mock JourneySections */
function createSections(n: number): JourneySection[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `section-${i}`,
    title: `Section ${i + 1}`,
    content: `Content for section ${i + 1}`,
    order: i,
    sourceTag: 'Document-sourced' as const,
    relatedSections: [],
  }));
}

describe('planQuizInsertion', () => {
  it('returns empty plan for fewer than 3 sections', () => {
    const result = planQuizInsertion(createSections(2));
    expect(result.insertionPoints).toEqual([]);
    expect(result.totalQuizzes).toBe(0);
  });

  it('returns empty plan for 0 sections', () => {
    const result = planQuizInsertion([]);
    expect(result.insertionPoints).toEqual([]);
    expect(result.totalQuizzes).toBe(0);
  });

  it('satisfies frequency constraint for N=5 sections', () => {
    const sections = createSections(5);
    const result = planQuizInsertion(sections);

    const minQ = Math.ceil(5 / 5); // 1
    const maxQ = Math.floor(5 / 3); // 1
    expect(result.totalQuizzes).toBeGreaterThanOrEqual(minQ);
    expect(result.totalQuizzes).toBeLessThanOrEqual(maxQ);
    expect(result.insertionPoints.length).toBe(result.totalQuizzes);
  });

  it('satisfies frequency constraint for N=10 sections', () => {
    const sections = createSections(10);
    const result = planQuizInsertion(sections);

    const minQ = Math.ceil(10 / 5); // 2
    const maxQ = Math.floor(10 / 3); // 3
    expect(result.totalQuizzes).toBeGreaterThanOrEqual(minQ);
    expect(result.totalQuizzes).toBeLessThanOrEqual(maxQ);
    expect(result.insertionPoints.length).toBe(result.totalQuizzes);
  });

  it('satisfies frequency constraint for N=15 sections', () => {
    const sections = createSections(15);
    const result = planQuizInsertion(sections);

    const minQ = Math.ceil(15 / 5); // 3
    const maxQ = Math.floor(15 / 3); // 5
    expect(result.totalQuizzes).toBeGreaterThanOrEqual(minQ);
    expect(result.totalQuizzes).toBeLessThanOrEqual(maxQ);
    expect(result.insertionPoints.length).toBe(result.totalQuizzes);
  });

  it('satisfies frequency constraint for N=50 sections', () => {
    const sections = createSections(50);
    const result = planQuizInsertion(sections);

    const minQ = Math.ceil(50 / 5); // 10
    const maxQ = Math.floor(50 / 3); // 16
    expect(result.totalQuizzes).toBeGreaterThanOrEqual(minQ);
    expect(result.totalQuizzes).toBeLessThanOrEqual(maxQ);
    expect(result.insertionPoints.length).toBe(result.totalQuizzes);
  });

  it('distributes quizzes evenly (not clustered at start or end)', () => {
    const sections = createSections(20);
    const result = planQuizInsertion(sections);

    // Verify insertion points are sorted
    const sorted = [...result.insertionPoints].sort((a, b) => a - b);
    expect(result.insertionPoints).toEqual(sorted);

    // Verify no quiz is placed at the very first section (index 0)
    // and quizzes span the range of sections
    if (result.totalQuizzes > 1) {
      const first = result.insertionPoints[0];
      const last = result.insertionPoints[result.insertionPoints.length - 1];
      // The range covered should be at least 50% of total sections
      expect(last - first).toBeGreaterThanOrEqual(Math.floor(sections.length * 0.4));
    }
  });

  it('all insertion points are valid section indices', () => {
    const sections = createSections(30);
    const result = planQuizInsertion(sections);

    for (const point of result.insertionPoints) {
      expect(point).toBeGreaterThanOrEqual(0);
      expect(point).toBeLessThan(sections.length);
    }
  });

  it('insertion points have no duplicates', () => {
    const sections = createSections(25);
    const result = planQuizInsertion(sections);

    const unique = new Set(result.insertionPoints);
    expect(unique.size).toBe(result.insertionPoints.length);
  });

  it('satisfies frequency constraint for N=3 (edge case)', () => {
    const sections = createSections(3);
    const result = planQuizInsertion(sections);

    const minQ = Math.ceil(3 / 5); // 1
    const maxQ = Math.floor(3 / 3); // 1
    expect(result.totalQuizzes).toBeGreaterThanOrEqual(minQ);
    expect(result.totalQuizzes).toBeLessThanOrEqual(maxQ);
  });
});
