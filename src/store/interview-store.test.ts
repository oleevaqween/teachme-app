import { beforeEach, describe, expect, it } from 'vitest';
import { useInterviewStore, type QuickAttempt } from './interview-store';

const attempt = (id: string, followUpOf: string | null = null): QuickAttempt => ({
  id, createdAt: '2026-11-15T10:00:00.000Z', questionText: 'Tell me about a project.', followUpOf,
  answer: 'I planned the project and kept it on schedule.', durationSeconds: 30, inputMethod: 'typed', score: 6,
  star: {
    situation: { rating: 'strong', note: '' }, task: { rating: 'weak', note: '' },
    action: { rating: 'strong', note: '' }, result: { rating: 'missing', note: '' },
  },
  fixes: ['Add the result.'], rewrite: null, rewriteWithheld: null, followUpQuestion: null,
});

beforeEach(() => useInterviewStore.getState().reset());

describe('interview store attempts', () => {
  it('appends attempts per question in order', () => {
    const { addAttempt } = useInterviewStore.getState();
    addAttempt('q1', attempt('a1'));
    addAttempt('q2', attempt('b1'));
    addAttempt('q1', attempt('a2', 'a1'));
    const { attempts } = useInterviewStore.getState();
    expect(attempts.q1.map(a => a.id)).toEqual(['a1', 'a2']);
    expect(attempts.q2.map(a => a.id)).toEqual(['b1']);
  });

  it('clears attempts and answers when a new set of questions is loaded', () => {
    const state = useInterviewStore.getState();
    state.addAttempt('q1', attempt('a1'));
    state.setAnswer('q1', 'draft');
    state.setQuestions([]);
    expect(useInterviewStore.getState().attempts).toEqual({});
    expect(useInterviewStore.getState().answers).toEqual({});
  });

  it('clears attempts on reset', () => {
    useInterviewStore.getState().addAttempt('q1', attempt('a1'));
    useInterviewStore.getState().reset();
    expect(useInterviewStore.getState().attempts).toEqual({});
  });
});

describe('interview store draft time', () => {
  it('keeps a draft time and input method per answer box and clears it on request', () => {
    const { setAnswerMeta } = useInterviewStore.getState();
    setAnswerMeta('q1:main', { seconds: 45, typed: true, spoken: false });
    expect(useInterviewStore.getState().answerMeta['q1:main']).toEqual({ seconds: 45, typed: true, spoken: false });
    setAnswerMeta('q1:main', null);
    expect(useInterviewStore.getState().answerMeta).toEqual({});
  });

  it('clears draft times with the answers when new questions load or on reset', () => {
    useInterviewStore.getState().setAnswerMeta('q1:main', { seconds: 45, typed: true, spoken: false });
    useInterviewStore.getState().setQuestions([]);
    expect(useInterviewStore.getState().answerMeta).toEqual({});
    useInterviewStore.getState().setAnswerMeta('q1:main', { seconds: 5, typed: true, spoken: false });
    useInterviewStore.getState().reset();
    expect(useInterviewStore.getState().answerMeta).toEqual({});
  });
});
