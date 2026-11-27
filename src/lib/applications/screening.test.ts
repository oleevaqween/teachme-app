import { describe, expect, it } from 'vitest';
import { ANSWER_TOO_LONG, HONESTY_NOTE, MAX_ANSWER, orderedQuestions, QUESTION_IDS, SCREENING_CONFLICT, SCREENING_QUESTIONS, ScreeningAnswersSchema, ScreeningProfileBodySchema } from './screening';

describe('screening questions', () => {
  it('has the ten questions in the standard order with their exact wording', () => {
    expect(QUESTION_IDS.map(id => [id, SCREENING_QUESTIONS[id]])).toEqual([
      ['uk-right', 'Do you have the right to work in the UK?'],
      ['uk-sponsor', 'Will you need visa sponsorship to work in the UK?'],
      ['us-right', 'Are you authorised to work in the US?'],
      ['us-sponsor', 'Will you now or in future need visa sponsorship to work in the US?'],
      ['ng-right', 'Do you have the right to work in Nigeria?'],
      ['location', 'Are you willing to relocate or work on site? Where?'],
      ['licences', 'Which licences or certifications do you hold, with dates?'],
      ['years', 'How many years of relevant experience do you have, and in what?'],
      ['salary', 'What salary do you expect?'],
      ['notice', 'What is your notice period or earliest start date?'],
    ]);
  });

  it('accepts known ids with answers up to 500 characters and refuses the rest plainly', () => {
    expect(MAX_ANSWER).toBe(500);
    expect(ScreeningAnswersSchema.safeParse({}).success).toBe(true);
    expect(ScreeningAnswersSchema.safeParse({ 'uk-right': 'Yes', notice: 'x'.repeat(500) }).success).toBe(true);
    expect(ScreeningAnswersSchema.safeParse({ pets: 'cat' }).success).toBe(false);
    expect(ScreeningAnswersSchema.safeParse({ salary: 'x'.repeat(501) }).error?.issues[0].message).toBe(ANSWER_TOO_LONG);
    expect(ANSWER_TOO_LONG).toBe('Answers must be 500 characters or fewer.');
  });
});

describe('question order by market', () => {
  it('puts the US questions first for a US CV', () => {
    expect(orderedQuestions('us')).toEqual(['us-right', 'us-sponsor', 'uk-right', 'uk-sponsor', 'ng-right', 'location', 'licences', 'years', 'salary', 'notice']);
  });
  it('puts the UK questions first for International / UK or no market', () => {
    expect(orderedQuestions('international')).toEqual([...QUESTION_IDS]);
    expect(orderedQuestions(null)).toEqual([...QUESTION_IDS]);
    expect(orderedQuestions(undefined)).toEqual([...QUESTION_IDS]);
  });
  it('puts the Nigeria question first for a Nigeria CV', () => {
    expect(orderedQuestions('nigeria')).toEqual(['ng-right', 'uk-right', 'uk-sponsor', 'us-right', 'us-sponsor', 'location', 'licences', 'years', 'salary', 'notice']);
  });
});

describe('screening notes and profile body', () => {
  it('keeps the exact wording', () => {
    expect(HONESTY_NOTE).toBe('Answer honestly. These questions often decide automatically whether you go forward, so a wrong answer can cost you later.');
    expect(SCREENING_CONFLICT).toBe('Your answers were changed in another tab. Reload to see them.');
  });
  it('holds answers only', () => {
    expect(ScreeningProfileBodySchema.safeParse({ answers: { notice: 'One month' } }).success).toBe(true);
    expect(ScreeningProfileBodySchema.safeParse({}).success).toBe(false);
  });
});
