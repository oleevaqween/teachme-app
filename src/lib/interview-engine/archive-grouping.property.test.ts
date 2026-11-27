// Property test for archive grouping by role
// Task 10.9

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 16: Archive Grouping by Role
 *
 * For any set of archived questions across multiple roles, the grouping function
 * SHALL produce groups where every item in a group has the same role, no item
 * appears in more than one group, and all items appear in exactly one group.
 *
 * **Validates: Requirements 7.5**
 */

interface ArchivedQuestionItem {
  id: string;
  role: string;
  question: string;
  userAnswer: string;
  score: number;
  archivedAt: Date;
}

/**
 * Pure groupByRole function that groups archived questions by their role.
 */
function groupByRole(items: ArchivedQuestionItem[]): Record<string, ArchivedQuestionItem[]> {
  const grouped: Record<string, ArchivedQuestionItem[]> = {};

  for (const item of items) {
    if (!grouped[item.role]) {
      grouped[item.role] = [];
    }
    grouped[item.role].push(item);
  }

  return grouped;
}

describe('Property 16: Archive Grouping by Role', () => {
  const roles = [
    'Software Engineer',
    'Product Manager',
    'Data Scientist',
    'DevOps Engineer',
    'UX Designer',
    'Backend Developer',
    'Frontend Developer',
  ];

  const archivedQuestionArb: fc.Arbitrary<ArchivedQuestionItem> = fc.record({
    id: fc.uuid(),
    role: fc.constantFrom(...roles),
    question: fc.string({ minLength: 10, maxLength: 100 }),
    userAnswer: fc.string({ minLength: 20, maxLength: 200 }),
    score: fc.integer({ min: 1, max: 10 }),
    archivedAt: fc.date({ min: new Date('2024-01-01'), max: new Date('2025-12-31') }),
  });

  const archivedQuestionsArb: fc.Arbitrary<ArchivedQuestionItem[]> = fc.array(
    archivedQuestionArb,
    { minLength: 1, maxLength: 50 }
  );

  it('every item in a group has the same role', () => {
    fc.assert(
      fc.property(archivedQuestionsArb, (items) => {
        const grouped = groupByRole(items);

        for (const [role, groupItems] of Object.entries(grouped)) {
          for (const item of groupItems) {
            expect(item.role).toBe(role);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it('no item appears in more than one group', () => {
    fc.assert(
      fc.property(archivedQuestionsArb, (items) => {
        const grouped = groupByRole(items);
        const seenIds = new Set<string>();

        for (const groupItems of Object.values(grouped)) {
          for (const item of groupItems) {
            expect(seenIds.has(item.id)).toBe(false);
            seenIds.add(item.id);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it('all items appear in exactly one group (total count preserved)', () => {
    fc.assert(
      fc.property(archivedQuestionsArb, (items) => {
        const grouped = groupByRole(items);

        // Total items across all groups equals original input count
        const totalGrouped = Object.values(grouped).reduce(
          (sum, groupItems) => sum + groupItems.length,
          0
        );
        expect(totalGrouped).toBe(items.length);
      }),
      { numRuns: 100 }
    );
  });
});
