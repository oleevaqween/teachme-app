import { describe, expect, it } from 'vitest';
import type { Workspace } from '@/lib/cv-studio/schema';
import { fixture } from '@/lib/cv-studio/test-fixture';
import { extraQuestionKey, packQuestionKey } from './question-key';
import type { Attempt, PracticeQuestion } from './schema';
import { applicationInfo, buildSessionQuestions, cvFactsFor, dedupeGenerated, FOLLOW_UP_INVALID, QUESTION_GONE, summarize, validateAttemptTarget } from './session';

const workspace: Workspace = {
  ...fixture(), id: 'app-1', name: 'Acme PM',
  package: {
    coverLetter: 'Letter', coverLetterApproved: false, learningPriorities: [],
    interview: [
      { question: 'Tell me about a budget you managed?', guidance: 'Use STAR.', evidence: ['experience.e1'] },
      { question: 'tell me about a budget you managed', guidance: 'Duplicate wording', evidence: [] },
      { question: 'How do you report to stakeholders?', guidance: '', evidence: [] },
    ],
  },
  packageInput: null,
};
const extra: PracticeQuestion = { id: 'x1', workspaceId: 'app-1', question: 'Why Acme?', guidance: 'Use the posting.', kind: 'company', createdAt: '2026-11-15T09:00:00.000Z' };
const budgetKey = packQuestionKey('Tell me about a budget you managed?');
const scored = (id: string, score: number, createdAt: string, extraFields: Partial<Attempt> = {}) => ({ id, questionKey: budgetKey, followUpOf: null, score, createdAt, ...extraFields }) as Attempt;

describe('buildSessionQuestions', () => {
  it('lists unique pack questions first, then extra questions, with plain evidence labels', () => {
    const questions = buildSessionQuestions(workspace, [extra], []);
    expect(questions.map(q => q.key)).toEqual([budgetKey, packQuestionKey('How do you report to stakeholders?'), extraQuestionKey('x1')]);
    expect(questions[0]).toMatchObject({ source: 'pack', kind: null, claim: null, evidence: ['Your role: Project Manager at Example Ltd'] });
    expect(questions[2]).toMatchObject({ source: 'extra', kind: 'company', claim: null, text: 'Why Acme?' });
  });

  it('computes progress from main attempts only', () => {
    const attempts = [scored('a', 5, '2026-11-15T10:00:00.000Z'), scored('b', 8, '2026-11-15T11:00:00.000Z'), scored('c', 6, '2026-11-15T12:00:00.000Z'), scored('f', 9, '2026-11-15T13:00:00.000Z', { followUpOf: 'a' })];
    expect(buildSessionQuestions(workspace, [], attempts)[0].progress).toEqual({ attempts: 3, best: 8, latest: 6 });
  });
});

describe('summarize', () => {
  it('averages the latest score of each practised question', () => {
    const attempts = [scored('a', 5, '2026-11-15T10:00:00.000Z'), scored('b', 8, '2026-11-15T11:00:00.000Z'), scored('x', 7, '2026-11-15T12:00:00.000Z', { questionKey: extraQuestionKey('x1') })];
    expect(summarize(buildSessionQuestions(workspace, [extra], attempts))).toEqual({ practised: 2, total: 3, average: 7.5 });
    expect(summarize(buildSessionQuestions(workspace, [], []))).toEqual({ practised: 0, total: 2, average: null });
  });
});

describe('validateAttemptTarget', () => {
  const questions = buildSessionQuestions(workspace, [extra], []);
  const main = scored('a', 5, '2026-11-15T10:00:00.000Z');
  const followUp = scored('f', 6, '2026-11-15T11:00:00.000Z', { followUpOf: 'a' });

  it('accepts current questions and follow-ups to a main answer of the same question', () => {
    expect(validateAttemptTarget(questions, [main], { questionKey: budgetKey, followUpOf: null })).toBeNull();
    expect(validateAttemptTarget(questions, [main], { questionKey: budgetKey, followUpOf: 'a' })).toBeNull();
  });

  it('rejects unknown questions, missing parents, other questions and follow-ups of follow-ups', () => {
    expect(validateAttemptTarget(questions, [], { questionKey: 'extra:gone', followUpOf: null })).toBe(QUESTION_GONE);
    expect(validateAttemptTarget(questions, [], { questionKey: budgetKey, followUpOf: 'missing' })).toBe(FOLLOW_UP_INVALID);
    expect(validateAttemptTarget(questions, [main], { questionKey: extraQuestionKey('x1'), followUpOf: 'a' })).toBe(FOLLOW_UP_INVALID);
    expect(validateAttemptTarget(questions, [main, followUp], { questionKey: budgetKey, followUpOf: 'f' })).toBe(FOLLOW_UP_INVALID);
  });
});

describe('applicationInfo, dedupeGenerated and cvFactsFor', () => {
  it('describes the application and flags a stale pack', () => {
    expect(applicationInfo(workspace)).toEqual({ id: 'app-1', name: 'Acme PM', kind: 'application', role: 'Acme PM', company: '', hasPosting: true, packStale: true });
  });

  it('drops generated questions that repeat existing or earlier ones', () => {
    const fresh = dedupeGenerated([
      { question: 'Why Acme', guidance: '', kind: 'company' },
      { question: 'Describe a conflict you resolved.', guidance: '', kind: 'behavioural' },
      { question: 'describe a conflict you resolved', guidance: '', kind: 'behavioural' },
    ], ['Why Acme?']);
    expect(fresh.map(q => q.question)).toEqual(['Describe a conflict you resolved.']);
  });

  it('shares CV facts without contact details', () => {
    const facts = cvFactsFor(workspace);
    expect(facts).not.toHaveProperty('personal');
    expect(facts['experience.e1']).toContain('Managed a budget');
  });
});

describe('claim questions and master CVs', () => {
  const claimQ: PracticeQuestion = { id: 'c1', workspaceId: 'app-1', question: 'How did you track the budget?', guidance: '', kind: 'claim', target: 'experience.e1', bullet: 'Managed a budget of ₦2,000,000.', createdAt: '2026-11-15T10:00:00.000Z' };
  it('lists claim questions with their claim, after pack questions', () => {
    const questions = buildSessionQuestions(workspace, [extra, claimQ], []);
    expect(questions.at(-1)).toMatchObject({ key: extraQuestionKey('c1'), source: 'claim', kind: 'claim', claim: { target: 'experience.e1', bullet: 'Managed a budget of ₦2,000,000.' } });
  });
  it('treats a master CV as having no pack, no posting and its professional title as the role', () => {
    const master: Workspace = { ...workspace, id: 'm1', name: 'Master CV', kind: 'master', parentId: null };
    expect(applicationInfo(master)).toEqual({ id: 'm1', name: 'Master CV', kind: 'master', role: 'Project Manager', company: '', hasPosting: false, packStale: false });
    expect(buildSessionQuestions(master, [{ ...claimQ, workspaceId: 'm1' }], []).map(q => q.source)).toEqual(['claim']);
    const untitled = { ...master, resume: { ...master.resume, personal: { ...master.resume.personal, professionalTitle: ' ' } } };
    expect(applicationInfo(untitled).role).toBe('Master CV');
  });
});
