import { describe, expect, it } from 'vitest';
import { AttemptSchema, ClaimRequestSchema, PracticeQuestionSchema, QuestionKeySchema, SaveEvidenceSchema, ScoreRequestSchema } from './schema';

const star = {
  situation: { rating: 'strong', note: 'Clear context.' },
  task: { rating: 'weak', note: 'Say what you owned.' },
  action: { rating: 'strong', note: '' },
  result: { rating: 'missing', note: 'No outcome.' },
};
const attempt = {
  id: 'a1', workspaceId: 'app-1', questionKey: 'pack:0123456789abcdef', questionText: 'Tell me about a budget.',
  followUpOf: null, answer: 'I managed a budget of two million naira for a year.', durationSeconds: 95,
  inputMethod: 'typed', score: 6, star, fixes: ['Lead with the result.'], rewrite: null, rewriteWithheld: null,
  followUpQuestion: 'What would you change?', createdAt: '2026-11-15T10:00:00.000Z',
};

describe('practice schema', () => {
  it('accepts pack and extra question keys only', () => {
    expect(QuestionKeySchema.safeParse('pack:0123456789abcdef').success).toBe(true);
    expect(QuestionKeySchema.safeParse('extra:abc-1').success).toBe(true);
    expect(QuestionKeySchema.safeParse('pack:XYZ').success).toBe(false);
    expect(QuestionKeySchema.safeParse('other:1').success).toBe(false);
  });

  it('validates a complete attempt and rejects bad scores, empty fixes and too many fixes', () => {
    expect(AttemptSchema.safeParse(attempt).success).toBe(true);
    expect(AttemptSchema.safeParse({ ...attempt, score: 11 }).success).toBe(false);
    expect(AttemptSchema.safeParse({ ...attempt, fixes: [] }).success).toBe(false);
    expect(AttemptSchema.safeParse({ ...attempt, fixes: ['a', 'b', 'c', 'd'] }).success).toBe(false);
  });

  it('requires at least 20 characters with a readable message', () => {
    const result = ScoreRequestSchema.safeParse({ application: 'app-1', questionKey: 'pack:0123456789abcdef', questionText: 'Q', answer: 'too short', durationSeconds: 3, inputMethod: 'typed' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe('Write at least 20 characters before asking for feedback.');
  });

  it('defaults followUpOf to null and drops unknown fields', () => {
    const parsed = ScoreRequestSchema.parse({ action: 'score', application: 'app-1', questionKey: 'pack:0123456789abcdef', questionText: 'Q', answer: 'A long enough answer for scoring.', durationSeconds: 3, inputMethod: 'spoken' });
    expect(parsed.followUpOf).toBeNull();
    expect(parsed).not.toHaveProperty('action');
  });
});

describe('claim question schema', () => {
  const base = { id: 'c1', workspaceId: 'app-1', question: 'How did you measure it?', guidance: '', createdAt: '2026-11-17T09:00:00.000Z' };
  it('requires target and bullet on claim questions only', () => {
    expect(PracticeQuestionSchema.safeParse({ ...base, kind: 'claim', target: 'experience.e1', bullet: 'Cut costs by 10%.' }).success).toBe(true);
    expect(PracticeQuestionSchema.safeParse({ ...base, kind: 'claim', target: 'experience.e1' }).success).toBe(false);
    expect(PracticeQuestionSchema.safeParse({ ...base, kind: 'company', target: 'experience.e1', bullet: 'x' }).success).toBe(false);
    expect(PracticeQuestionSchema.safeParse({ ...base, kind: 'company' }).success).toBe(true);
    expect(PracticeQuestionSchema.safeParse({ ...base, kind: 'claim', target: 'summary', bullet: 'x' }).success).toBe(false);
  });
  it('parses claim requests with fresh defaulting to false and a trimmed bullet', () => {
    expect(ClaimRequestSchema.parse({ application: 'app-1', target: 'projects', bullet: '  Built a tracker.  ' })).toEqual({ application: 'app-1', target: 'projects', bullet: 'Built a tracker.', fresh: false });
  });
  it('refuses to save evidence without the tick', () => {
    const body = { application: 'app-1', attemptId: 'a1', answer: 'I tracked every invoice in a shared sheet.', number: 'none' };
    const refused = SaveEvidenceSchema.safeParse({ ...body, confirmed: false });
    expect(refused.success).toBe(false);
    expect(refused.error?.issues[0]?.message).toBe('Tick "This is true and I can back it up" before saving.');
    expect(SaveEvidenceSchema.safeParse({ ...body, confirmed: true }).success).toBe(true);
    expect(SaveEvidenceSchema.safeParse({ ...body, answer: 'short', confirmed: true }).success).toBe(false);
  });
});
