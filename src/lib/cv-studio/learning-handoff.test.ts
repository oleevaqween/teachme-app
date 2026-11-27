import { describe, expect, it, vi } from 'vitest';
import { clearLearningHandoff, learningHandoffKey, loadLearningHandoff, saveLearningHandoff } from './learning-handoff';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn((key: string) => { values.delete(key); }),
  };
}

describe('CV Studio to Teach Me handoff', () => {
  it('persists structured learning context across a page refresh until it is cleared', () => {
    const storage = memoryStorage();
    saveLearningHandoff(storage, {
      topic: 'Stakeholder mapping',
      exercise: 'Map the stakeholders in a fictional programme.',
      role: 'Programme Manager',
      company: 'Example Ltd',
      applicationId: 'application-1',
    });

    const first = loadLearningHandoff(storage);
    expect(first).toMatchObject({ topic: 'Stakeholder mapping', role: 'Programme Manager', version: 1 });
    expect(loadLearningHandoff(storage)).toEqual(first);
    clearLearningHandoff(storage);
    expect(loadLearningHandoff(storage)).toBeNull();
    expect(storage.removeItem).toHaveBeenCalledWith(learningHandoffKey);
  });

  it('discards malformed or oversized handoffs instead of pre-filling Teach Me', () => {
    const storage = memoryStorage();
    storage.setItem(learningHandoffKey, JSON.stringify({ version: 1, topic: 'x', applicationId: 'application-1' }));
    expect(loadLearningHandoff(storage)).toBeNull();
    expect(storage.getItem(learningHandoffKey)).toBeNull();
  });

  it('does not perform a network request or create a journey', () => {
    const storage = memoryStorage();
    const originalFetch = globalThis.fetch;
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as typeof fetch;
    try {
      saveLearningHandoff(storage, { topic: 'Risk registers', exercise: '', role: '', company: '', applicationId: 'application-2' });
      expect(loadLearningHandoff(storage)?.topic).toBe('Risk registers');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
