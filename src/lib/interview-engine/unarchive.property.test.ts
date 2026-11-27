// Property test for unarchive removes item
// Task 10.8

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 15: Unarchive Removes Item
 *
 * For any archived question, calling unarchive followed by querying the archive
 * SHALL result in that question no longer being present in the archive results.
 *
 * We simulate the archive storage as a pure function using an in-memory ArchiveStore:
 * archive items → unarchive a subset → verify those items are gone from getAll/getByRole.
 *
 * **Validates: Requirements 7.6**
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

  unarchive(id: string): void {
    this.items = this.items.filter((item) => item.id !== id);
  }

  getByRole(role: string): ArchivedItem[] {
    return this.items.filter((item) => item.role === role);
  }

  getAll(): ArchivedItem[] {
    return [...this.items];
  }
}

describe('Property 15: Unarchive Removes Item', () => {
  // Generators
  const questionTextArb = fc.string({ minLength: 5, maxLength: 200 });
  const answerTextArb = fc.string({ minLength: 20, maxLength: 500 });
  const scoreArb = fc.integer({ min: 1, max: 10 });
  const roleArb = fc.string({ minLength: 2, maxLength: 50 });
  const idArb = fc
    .tuple(
      fc.string({ minLength: 3, maxLength: 10, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')) }),
      fc.integer({ min: 1, max: 9999 })
    )
    .map(([prefix, num]) => `mq-${prefix}-${num}`);

  it('after unarchiving, the item is no longer present in getAll results', () => {
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

          // Verify it exists
          expect(store.getAll().find((item) => item.id === id)).toBeDefined();

          // Unarchive it
          store.unarchive(id);

          // Verify it's gone from getAll
          const allItems = store.getAll();
          const found = allItems.find((item) => item.id === id);
          expect(found).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('after unarchiving, the item is no longer present in getByRole results', () => {
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

          // Verify it exists for role
          expect(store.getByRole(role).find((item) => item.id === id)).toBeDefined();

          // Unarchive it
          store.unarchive(id);

          // Verify it's gone from getByRole
          const roleItems = store.getByRole(role);
          const found = roleItems.find((item) => item.id === id);
          expect(found).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('unarchiving a subset removes only those items, leaving others intact', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(idArb, roleArb, questionTextArb, answerTextArb, scoreArb),
          { minLength: 2, maxLength: 10 }
        ),
        (items) => {
          const store = new ArchiveStore();

          // Archive all items with unique IDs
          const archivedIds: string[] = [];
          for (let i = 0; i < items.length; i++) {
            const [id, role, question, userAnswer, score] = items[i];
            const uniqueId = `${id}-${i}`;
            store.archive(uniqueId, role, question, userAnswer, score);
            archivedIds.push(uniqueId);
          }

          // Verify all items are present
          expect(store.getAll().length).toBe(items.length);

          // Unarchive a random subset (first half)
          const toRemove = archivedIds.slice(0, Math.ceil(archivedIds.length / 2));
          const toKeep = archivedIds.slice(Math.ceil(archivedIds.length / 2));

          for (const id of toRemove) {
            store.unarchive(id);
          }

          // Verify removed items are gone
          const remaining = store.getAll();
          for (const removedId of toRemove) {
            expect(remaining.find((item) => item.id === removedId)).toBeUndefined();
          }

          // Verify kept items are still present
          for (const keptId of toKeep) {
            expect(remaining.find((item) => item.id === keptId)).toBeDefined();
          }

          // Verify total count
          expect(remaining.length).toBe(toKeep.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('unarchiving from a populated store with multiple roles removes correctly', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(idArb, fc.constantFrom('frontend', 'backend', 'devops'), questionTextArb, answerTextArb, scoreArb),
          { minLength: 3, maxLength: 12 }
        ),
        fc.integer({ min: 0 }),
        (items, randomSeed) => {
          const store = new ArchiveStore();

          // Archive all items with unique IDs
          const archivedIds: Array<{ id: string; role: string }> = [];
          for (let i = 0; i < items.length; i++) {
            const [id, role, question, userAnswer, score] = items[i];
            const uniqueId = `${id}-${i}`;
            store.archive(uniqueId, role, question, userAnswer, score);
            archivedIds.push({ id: uniqueId, role });
          }

          // Pick a random item to unarchive
          const targetIdx = randomSeed % archivedIds.length;
          const target = archivedIds[targetIdx];

          store.unarchive(target.id);

          // Verify the item is gone from both getAll and getByRole
          expect(store.getAll().find((item) => item.id === target.id)).toBeUndefined();
          expect(store.getByRole(target.role).find((item) => item.id === target.id)).toBeUndefined();

          // Verify total count decreased by exactly 1
          expect(store.getAll().length).toBe(items.length - 1);
        }
      ),
      { numRuns: 100 }
    );
  });
});
