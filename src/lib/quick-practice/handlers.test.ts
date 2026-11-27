import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { UNREADABLE_FEEDBACK, UnreadableFeedbackError, type ScoreContext } from '@/lib/practice/feedback';
import type { Feedback } from '@/lib/practice/schema';
import { createQuickScoreHandler, QUICK_REWRITE_WITHHELD } from './handlers';

const feedback = (over: Partial<Feedback> = {}): Feedback => ({
  score: 7,
  star: {
    situation: { rating: 'strong', note: 'Clear context.' },
    task: { rating: 'weak', note: '' },
    action: { rating: 'strong', note: '' },
    result: { rating: 'missing', note: 'Say what changed.' },
  },
  fixes: ['Add the outcome.'],
  rewrite: 'I led the weekly planning meeting and kept the release on track.',
  followUpQuestion: 'What would you do differently?',
  ...over,
});

const ANSWER = 'I led the weekly planning meeting for 6 people and kept the release on track.';
const valid = { role: 'Project Manager', question: 'Tell me about a time you kept a project on track.', answer: ANSWER };
const post = (body: unknown, url = 'http://localhost/api/interview/score') =>
  new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

function setup(result: Feedback | Error = feedback()) {
  const score = vi.fn(async (ctx: ScoreContext) => {
    void ctx;
    if (result instanceof Error) throw result;
    return result;
  });
  return { score, handler: createQuickScoreHandler({ score }) };
}

describe('POST /api/interview/score (quick practice)', () => {
  it('scores a main answer against the role only and returns the STAR feedback', async () => {
    const { score, handler } = setup();
    const response = await handler.POST(post(valid));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      score: 7, star: feedback().star, fixes: ['Add the outcome.'],
      rewrite: feedback().rewrite, rewriteWithheld: null, followUpQuestion: 'What would you do differently?',
    });
    expect(score).toHaveBeenCalledTimes(1);
    expect(score.mock.calls[0][0]).toEqual({
      role: 'Project Manager', company: '', posting: '', cvFacts: {},
      question: valid.question, answer: ANSWER, parent: undefined,
    });
  });

  it('withholds a rewrite that adds a number the answer does not contain, and keeps one that does not', async () => {
    const invented = setup(feedback({ rewrite: 'I led a team of 12 people and kept the release on track.' }));
    const withheld = await (await invented.handler.POST(post(valid))).json();
    expect(withheld.rewrite).toBeNull();
    expect(withheld.rewriteWithheld).toBe(QUICK_REWRITE_WITHHELD);

    const honestText = 'I ran the weekly planning meeting for 6 people and kept the release on track.';
    const honest = setup(feedback({ rewrite: honestText }));
    const kept = await (await honest.handler.POST(post(valid))).json();
    expect(kept.rewrite).toBe(honestText);
    expect(kept.rewriteWithheld).toBeNull();
  });

  it('treats the earlier answer as a source for a follow-up and never returns another follow-up', async () => {
    const parent = { question: 'Tell me about a time you kept a project on track.', answer: 'We shipped the release 3 weeks early after I reorganised the plan.' };
    const { score, handler } = setup(feedback({
      rewrite: 'Because I reorganised the plan we shipped 3 weeks early, and next time I would share the plan sooner.',
      followUpQuestion: 'Another question?',
    }));
    const body = await (await handler.POST(post({
      ...valid, question: 'What would you do differently?', answer: 'Next time I would share the plan with the team much sooner.', parent,
    }))).json();
    expect(body.rewrite).toContain('3 weeks');
    expect(body.rewriteWithheld).toBeNull();
    expect(body.followUpQuestion).toBeNull();
    expect(score.mock.calls[0][0].parent).toEqual(parent);
  });

  it.each([
    ['a short answer', { ...valid, answer: 'Too short.' }],
    ['a missing role', { question: valid.question, answer: ANSWER }],
    ['an over-long question', { ...valid, question: 'x'.repeat(1001) }],
    ['a short follow-up parent answer', { ...valid, parent: { question: 'Earlier?', answer: 'short' } }],
  ])('rejects %s with 400 and does not call the AI', async (_label, body) => {
    const { score, handler } = setup();
    const response = await handler.POST(post(body));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toEqual(expect.any(String));
    expect(score).not.toHaveBeenCalled();
  });

  it('refuses requests that are not from this computer', async () => {
    const { score, handler } = setup();
    expect((await handler.POST(post(valid, 'http://example.com/api/interview/score'))).status).toBe(400);
    expect(score).not.toHaveBeenCalled();
  });

  it('reports AI failures as 502 with a readable message, logging all but cancellations', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const unreadable = setup(new UnreadableFeedbackError());
      const first = await unreadable.handler.POST(post(valid));
      expect(first.status).toBe(502);
      expect((await first.json()).error).toBe(UNREADABLE_FEEDBACK);
      expect(log).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith('[quick-practice] AI step failed:', expect.any(UnreadableFeedbackError));

      const abort = new Error('aborted');
      abort.name = 'AbortError';
      const cancelled = setup(abort);
      const second = await cancelled.handler.POST(post(valid));
      expect(second.status).toBe(502);
      expect((await second.json()).error).toBe('The request was cancelled.');
      expect(log).toHaveBeenCalledTimes(1);
    } finally {
      log.mockRestore();
    }
  });

  it('never writes to a database', () => {
    for (const file of ['src/lib/quick-practice/handlers.ts', 'src/app/api/interview/score/route.ts']) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      expect(source).not.toMatch(/prisma|@\/lib\/db|repository/i);
    }
  });
});
