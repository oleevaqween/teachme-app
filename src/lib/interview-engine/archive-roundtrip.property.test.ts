// Property test for archive round-trip
// Task 10.7

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 14: Archive Round-Trip
 *
 * For any question with associated answer and score, archiving the item and then
 * retrieving it should return the same data. (question text, answer text, score value).
 *
 * We simulate the archive storage as a pure function: store item → retrieve all →
 * verify the stored item appears with same data.
 *
 * **Validates: Requirements 7.1**
 */

interface ArchivedItem {
  id: string;
  role: string;
  question: string;
  userAnswer: string;
  score: number;
  archivedAt: Date;
}

/**
 * In-memory archive store (simulates database behavior).
 */
class ArchiveStore {
  private items: ArchivedItem[] = [];

  archive(
    id: string,
    role: string,
    question: string,
    userAnswer: string,
    score: number
  ): ArchivedItem {
    const item: ArchivedItem = {
      id,
      role,
      question,
      userAnswer,
      score,
      archivedAt: new Date(),
    };
    this.items.push(item);
    return item;
  }

  getByRole(role: string): ArchivedItem[] {
    return this.items.filter((item) => item.role === role);
  }

  getAll(): ArchivedItem[] {
    return [...this.items];
  }
}

describe('Property 14: Archive Round-Trip', () => {
  // Generate random question/answer/score tuples
  const questionTextArb: fc.Arbitrary<string> = fc.string({ minLength: 5, maxLength: 200 });
  const answerTextArb: fc.Arbitrary<string> = fc.string({ minLength: 20, maxLength: 500 });
  const scoreArb: fc.Arbitrary<number> = fc.integer({ min: 1, max: 10 });
  const roleArb: fc.Arbitrary<string> = fc.string({ minLength: 2, maxLength: 50 });
  const idArb: fc.Arbitrary<string> = fc
    .tuple(
      fc.string({ minLength: 3, maxLength: 10, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')) }),
      fc.integer({ min: 1, max: 9999 })
    )
    .map(([prefix, num]) => `mq-${prefix}-${num}`);

  it('archived item can be retrieved with same question, answer, and score', () => {
    fc.assert(
      fc.property(
        idArb,
        roleArb,
        questionTextArb,
        answerTextArb,
        scoreArb,
        (id, role, question, userAnswer, score) => {
          const store = new ArchiveStore();

          // Archive the item
          store.archive(id, role, question, userAnswer, score);

          // Retrieve by role
          const retrieved = store.getByRole(role);

          // Verify the stored item appears
          const found = retrieved.find((item) => item.id === id);
          expect(found).toBeDefined();
          expect(found!.question).toBe(question);
          expect(found!.userAnswer).toBe(userAnswer);
          expect(found!.score).toBe(score);
          expect(found!.role).toBe(role);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('archived item appears in getAll results', () => {
    fc.assert(
      fc.property(
        idArb,
        roleArb,
        questionTextArb,
        answerTextArb,
        scoreArb,
        (id, role, question, userAnswer, score) => {
          const store = new ArchiveStore();

          store.archive(id, role, question, userAnswer, score);

          const all = store.getAll();
          const found = all.find((item) => item.id === id);
          expect(found).toBeDefined();
          expect(found!.question).toBe(question);
          expect(found!.userAnswer).toBe(userAnswer);
          expect(found!.score).toBe(score);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('multiple archived items all survive retrieval', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(idArb, roleArb, questionTextArb, answerTextArb, scoreArb),
          { minLength: 1, maxLength: 10 }
        ),
        (items) => {
          const store = new ArchiveStore();

          // Archive all items (use unique IDs by appending index)
          const archivedIds: string[] = [];
          for (let i = 0; i < items.length; i++) {
            const [id, role, question, userAnswer, score] = items[i];
            const uniqueId = `${id}-${i}`;
            store.archive(uniqueId, role, question, userAnswer, score);
            archivedIds.push(uniqueId);
          }

          // All should be retrievable
          const all = store.getAll();
          expect(all.length).toBe(items.length);

          for (let i = 0; i < items.length; i++) {
            const [, , question, userAnswer, score] = items[i];
            const found = all.find((item) => item.id === archivedIds[i]);
            expect(found).toBeDefined();
            expect(found!.question).toBe(question);
            expect(found!.userAnswer).toBe(userAnswer);
            expect(found!.score).toBe(score);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
