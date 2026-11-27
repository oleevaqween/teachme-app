import { describe, expect, it } from 'vitest';
import { CHECK_SCORE_RULE, checkScoreLabel, isMissingCheckResultTable, parseCheckScore } from './check-score';

describe('parseCheckScore', () => {
  it('reads the closing score line', () => {
    expect(parseCheckScore('Good work overall.\n\nReview: scope baselines.\n\nScore: 3/4')).toEqual({ correct: 3, total: 4 });
  });

  it('accepts common variations a model writes', () => {
    expect(parseCheckScore('Summary.\n**Score: 2/3**')).toEqual({ correct: 2, total: 3 });
    expect(parseCheckScore('Summary.\nScore: 4 / 4.')).toEqual({ correct: 4, total: 4 });
    expect(parseCheckScore('Summary.\nscore: 1 out of 4')).toEqual({ correct: 1, total: 4 });
    expect(parseCheckScore('Summary.\n**Score:** 0/3')).toEqual({ correct: 0, total: 3 });
  });

  it('uses the last score line when there are several', () => {
    expect(parseCheckScore('Score: 1/4 so far.\nMore.\nScore: 3/4')).toEqual({ correct: 3, total: 4 });
  });

  it('only counts a score on the last line, so a running tally is never the result', () => {
    expect(parseCheckScore('Right.\n\n**Score: 1/1**\n\nQuestion 2: who is informed?')).toBeNull();
    expect(parseCheckScore('Score: 0/4\n\nQuestion 1: who signs off?')).toBeNull();
    expect(parseCheckScore('Summary.\n\nScore: 3/4\n\n')).toEqual({ correct: 3, total: 4 });
  });

  it('accepts headings, list marks, a leading word and a short tail', () => {
    for (const line of ['### Score: 3/4', '- **Score:** 3/4', 'Final score: 3/4', 'Your score: 3/4', 'Score: 3/4 (75%)', 'Score: 3 out of 4 correct', 'Score: 3/4 questions', '> Score: 3/4']) {
      expect(parseCheckScore(`Summary.\n${line}`), line).toEqual({ correct: 3, total: 4 });
    }
  });

  it('rejects a total larger than the questions actually asked', () => {
    expect(parseCheckScore('Summary.\nScore: 3/4', 3)).toBeNull();
    expect(parseCheckScore('Summary.\nScore: 3/3', 3)).toEqual({ correct: 3, total: 3 });
    expect(parseCheckScore('Summary.\nScore: 1/1', 0)).toBeNull();
  });

  it('ignores text without a score line, or with impossible numbers', () => {
    expect(parseCheckScore('Question 2: what is a WBS?')).toBeNull();
    expect(parseCheckScore('The score of 3/4 on page 12 means...')).toBeNull();
    expect(parseCheckScore('Score: 5/4')).toBeNull();
    expect(parseCheckScore('Score: 0/0')).toBeNull();
    expect(parseCheckScore('Score: 3/40')).toBeNull();
  });
});

describe('CHECK_SCORE_RULE', () => {
  it('asks for the exact closing line', () => {
    expect(CHECK_SCORE_RULE).toContain('Score: N/M');
  });
});

describe('checkScoreLabel', () => {
  it('reads as a short phrase for the map', () => {
    expect(checkScoreLabel({ correct: 3, total: 4 })).toBe('Last check 3/4');
  });
});

describe('isMissingCheckResultTable', () => {
  it('spots only the CheckResult table', () => {
    expect(isMissingCheckResultTable(new Error('SQLITE_ERROR: no such table: main.CheckResult'))).toBe(true);
    expect(isMissingCheckResultTable(Object.assign(new Error('The table `main.CheckResult` does not exist'), { code: 'P2021' }))).toBe(true);
    expect(isMissingCheckResultTable(new Error('no such table: main.StageNote'))).toBe(false);
    expect(isMissingCheckResultTable('no such table: main.CheckResult')).toBe(false);
  });
});
