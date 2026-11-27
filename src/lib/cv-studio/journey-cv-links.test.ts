import { describe, expect, it, vi } from 'vitest';
import {
  MAX_JOURNEY_CV_LINKS,
  LEARNING_IS_NOT_EXPERIENCE,
  cvEvidenceHref,
  findJourneyCvLink,
  finishedLearningLine,
  journeyCvLinksKey,
  rememberJourneyCvLink,
} from './journey-cv-links';

function memoryStorage(initial?: string) {
  const values = new Map<string, string>(initial === undefined ? [] : [[journeyCvLinksKey, initial]]);
  return {
    values,
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
  };
}

const link = (n: number) => ({ journeyId: `j${n}`, topic: 'Power BI', role: 'Data Analyst', company: 'Acme', applicationId: `app-${n}` });

describe('remembered CV links', () => {
  it('remembers a link under the fixed key and finds it again', () => {
    const storage = memoryStorage();
    expect(rememberJourneyCvLink(storage, link(1))).toEqual(link(1));
    expect(storage.setItem).toHaveBeenCalledWith('teachme.journey-cv-links.v1', expect.any(String));
    expect(findJourneyCvLink(storage, 'j1')).toEqual(link(1));
    expect(findJourneyCvLink(storage, 'j2')).toBeNull();
  });

  it('fills in a missing role and company as empty', () => {
    const storage = memoryStorage();
    rememberJourneyCvLink(storage, { journeyId: 'j1', topic: 'SQL', applicationId: 'app-1' });
    expect(findJourneyCvLink(storage, 'j1')).toEqual({ journeyId: 'j1', topic: 'SQL', role: '', company: '', applicationId: 'app-1' });
  });

  it('replaces the link for the same journey', () => {
    const storage = memoryStorage();
    rememberJourneyCvLink(storage, link(1));
    rememberJourneyCvLink(storage, { ...link(1), topic: 'SQL' });
    expect(JSON.parse(storage.values.get(journeyCvLinksKey)!)).toHaveLength(1);
    expect(findJourneyCvLink(storage, 'j1')?.topic).toBe('SQL');
  });

  it('keeps at most 50 links, dropping the oldest', () => {
    const storage = memoryStorage();
    for (let n = 1; n <= MAX_JOURNEY_CV_LINKS + 2; n++) rememberJourneyCvLink(storage, link(n));
    const saved = JSON.parse(storage.values.get(journeyCvLinksKey)!);
    expect(MAX_JOURNEY_CV_LINKS).toBe(50);
    expect(saved).toHaveLength(50);
    expect(findJourneyCvLink(storage, 'j1')).toBeNull();
    expect(findJourneyCvLink(storage, 'j2')).toBeNull();
    expect(findJourneyCvLink(storage, 'j3')).toEqual(link(3));
    expect(findJourneyCvLink(storage, 'j52')).toEqual(link(52));
  });

  it('ignores bad data: unreadable JSON, a non-list, and bad entries', () => {
    expect(findJourneyCvLink(memoryStorage('{not json'), 'j1')).toBeNull();
    expect(findJourneyCvLink(memoryStorage('{"journeyId":"j1"}'), 'j1')).toBeNull();
    const mixed = memoryStorage(JSON.stringify([{ journeyId: 'j1' }, 42, link(2)]));
    expect(findJourneyCvLink(mixed, 'j1')).toBeNull();
    expect(findJourneyCvLink(mixed, 'j2')).toEqual(link(2));
    rememberJourneyCvLink(mixed, link(3));
    expect(JSON.parse(mixed.values.get(journeyCvLinksKey)!)).toEqual([link(2), link(3)]);
  });

  it('remembers nothing without an application or a topic', () => {
    const storage = memoryStorage();
    expect(rememberJourneyCvLink(storage, { ...link(1), applicationId: '' })).toBeNull();
    expect(rememberJourneyCvLink(storage, { ...link(1), topic: '  ' })).toBeNull();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('swallows storage errors and missing storage', () => {
    const broken = {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('QuotaExceededError'); },
    };
    expect(rememberJourneyCvLink(broken, link(1))).toBeNull();
    expect(findJourneyCvLink(broken, 'j1')).toBeNull();
    expect(rememberJourneyCvLink(null, link(1))).toBeNull();
    expect(findJourneyCvLink(null, 'j1')).toBeNull();
  });
});

describe('completion wording and link', () => {
  it('names role and company only when known', () => {
    expect(finishedLearningLine({ topic: 'Power BI', role: 'Data Analyst', company: 'Acme' })).toBe("You've finished learning Power BI for Data Analyst at Acme.");
    expect(finishedLearningLine({ topic: 'Power BI', role: 'Data Analyst', company: '' })).toBe("You've finished learning Power BI for Data Analyst.");
    expect(finishedLearningLine({ topic: 'Power BI', role: '', company: 'Acme' })).toBe("You've finished learning Power BI at Acme.");
    expect(finishedLearningLine({ topic: 'Power BI', role: '', company: '' })).toBe("You've finished learning Power BI.");
  });

  it('keeps the fixed reminder wording', () => {
    expect(LEARNING_IS_NOT_EXPERIENCE).toBe("Learning alone isn't experience. When you've used it in a project, exercise or task, add it as evidence so your CV can say so truthfully.");
  });

  it('links to the application with the topic as evidence, encoded', () => {
    expect(cvEvidenceHref({ applicationId: 'app-1', topic: 'Power BI & DAX' })).toBe('/cv-studio?open=app-1&evidence=Power+BI+%26+DAX');
    expect(new URLSearchParams(cvEvidenceHref({ applicationId: 'app-1', topic: 'Power BI & DAX' }).split('?')[1]).get('evidence')).toBe('Power BI & DAX');
  });
});
