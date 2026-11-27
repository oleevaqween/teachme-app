import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ generate: vi.fn(), config: vi.fn() }));
vi.mock('ai', () => ({ generateText: mock.generate }));
vi.mock('@/lib/llm/config', () => ({ getActiveProviderConfig: mock.config }));
vi.mock('@/lib/llm/provider', () => ({ createProvider: () => ({ chat: () => 'test-model' }) }));
import { improveQuestions, improveSuggestions } from './improve';
import { fixture } from './test-fixture';
import type { Workspace } from './schema';
import { ImproveAnswerSchema } from './improve-schema';

const reply = (value: unknown) => mock.generate.mockResolvedValueOnce({ text: JSON.stringify(value), finishReason: 'stop' });
const fail = () => mock.generate.mockRejectedValueOnce(new Error('provider down'));
const withAnswer = (w: Workspace, answer: string, number: 'exact' | 'approximate' | 'none' = 'exact'): Workspace =>
  ({ ...w, improve: { answers: [{ id: 'a1', target: 'experience.e1', bullet: w.resume.experience[0].achievements.split('\n')[1], question: 'How many?', answer, number, status: 'answered' }] } });
const line = (w: Workspace, i: number) => w.resume.experience[0].achievements.split('\n')[i];

describe('Improve my CV (controlled provider responses)', () => {
  beforeEach(() => { vi.resetAllMocks(); mock.config.mockResolvedValue({ type: 'openai', model: 'test' }); });

  it('asks targeted questions about real bullets and falls back to fixed questions when the AI fails', async () => {
    const w = fixture();
    reply({ questions: [{ bullet: line(w, 1), question: 'Who used the reports?', why: 'Adds the result.' }, { bullet: 'Not a real bullet', question: 'Invented?', why: '' }] });
    const asked = await improveQuestions(w, 'experience.e1');
    expect(asked.fallback).toBe(false);
    expect(asked.questions).toEqual([{ bullet: line(w, 1), question: 'Who used the reports?', why: 'Adds the result.' }, { bullet: '', question: 'Invented?', why: '' }]);
    fail();
    const fallback = await improveQuestions(w, 'experience.e1');
    expect(fallback.fallback).toBe(true);
    expect(fallback.questions).toHaveLength(4);
  });

  it('clamps a very long CV line so the saved answer still passes the schema', async () => {
    const w = fixture();
    const long = 'x'.repeat(5000);
    w.resume.experience[0].achievements = 'Short line\n' + long;
    reply({ questions: [{ bullet: long, question: 'q'.repeat(5000), why: 'Adds the result.' }, { bullet: '', question: 'Second?', why: '' }] });
    const asked = await improveQuestions(w, 'experience.e1');
    expect(asked.questions[0].bullet.length).toBeLessThanOrEqual(2000);
    expect(asked.questions[0].question.length).toBeLessThanOrEqual(2000);
    expect(asked.fallback).toBe(false);
    const q = asked.questions[0];
    expect(q.bullet.length).toBeGreaterThan(0);
    expect(ImproveAnswerSchema.safeParse({ id: 'a1', target: 'experience.e1', bullet: q.bullet, question: q.question, answer: '', number: 'none', status: 'draft' }).success).toBe(true);
  });
  it('sends the confirmed answers to the meaning audit and keeps Improve answers out of the shared catalog', async () => {
    const w = withAnswer(fixture(), 'I helped the 4 stakeholders approve the budget each month.');
    reply({ suggestions: [{ line: 1, after: 'Prepared monthly reports for 4 stakeholders who approved the budget', reason: 'r', sources: [{ source: 'improve.a1', quote: 'helped the 4 stakeholders approve the budget' }] }] });
    reply({ checks: [{ id: 'experience.e1.achievements#1', supported: true, reason: 'ok' }] });
    await improveSuggestions(w, 'experience.e1');
    const auditData = JSON.parse(mock.generate.mock.calls[1][0].prompt);
    expect(auditData.confirmedAnswers).toEqual([{ question: 'How many?', answer: 'I helped the 4 stakeholders approve the budget each month.', number: 'exact' }]);
    expect(auditData.catalog['improve.a1']).toBeDefined();
  });
  it('keeps a supported suggestion, flags ownership and normalises dashes', async () => {
    const w = withAnswer(fixture(), 'I helped the 4 stakeholders approve the budget each month.');
    reply({ suggestions: [{ line: 1, after: 'Led monthly reports — for 4 stakeholders who approved the budget', reason: 'Adds the result', sources: [{ source: 'improve.a1', quote: 'helped the 4 stakeholders approve the budget' }] }] });
    reply({ checks: [{ id: 'experience.e1.achievements#1', supported: true, reason: 'ok' }] });
    const { suggestions } = await improveSuggestions(w, 'experience.e1');
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({ field: 'experience.e1.achievements', line: 1, before: line(w, 1) });
    expect(suggestions[0].after).not.toContain('—');
    expect(suggestions[0].flags.join(' ')).toContain('Claims more ownership');
  });

  it('repairs an invented number once, then withholds it if still unsupported', async () => {
    const w = withAnswer(fixture(), 'They approved the budget.');
    reply({ suggestions: [{ line: 1, after: 'Prepared monthly reports for 9 stakeholders', reason: 'r', sources: [{ source: 'improve.a1', quote: 'approved the budget' }] }] });
    reply({ suggestions: [{ line: 1, after: 'Prepared monthly reports for 9 stakeholders', reason: 'r', sources: [{ source: 'improve.a1', quote: 'approved the budget' }] }] });
    const { suggestions, notices } = await improveSuggestions(w, 'experience.e1');
    expect(suggestions).toEqual([]);
    expect(notices.join(' ')).toContain('numbers');
    expect(mock.generate).toHaveBeenCalledTimes(2);
  });

  it('requires a qualifier for an approximate number and accepts the repaired wording', async () => {
    const w = withAnswer(fixture(), 'About 20 managers read them', 'approximate');
    reply({ suggestions: [{ line: 1, after: 'Prepared monthly reports read by 20 managers', reason: 'r', sources: [{ source: 'improve.a1', quote: 'About 20 managers read them' }] }] });
    reply({ suggestions: [{ line: 1, after: 'Prepared monthly reports read by about 20 managers', reason: 'r', sources: [{ source: 'improve.a1', quote: 'About 20 managers read them' }] }] });
    reply({ checks: [{ id: 'experience.e1.achievements#1', supported: true, reason: 'ok' }] });
    const { suggestions } = await improveSuggestions(w, 'experience.e1');
    expect(suggestions[0].after).toBe('Prepared monthly reports read by about 20 managers');
  });

  it('retries the audit once and returns the suggestion when the retry works', async () => {
    const w = withAnswer(fixture(), 'They approved the budget.');
    reply({ suggestions: [{ line: 1, after: 'Prepared monthly reports that the board used to approve the budget', reason: 'r', sources: [{ source: 'improve.a1', quote: 'approved the budget' }] }] });
    fail();
    reply({ checks: [{ id: 'experience.e1.achievements#1', supported: true, reason: 'ok' }] });
    const result = await improveSuggestions(w, 'experience.e1');
    expect(result.suggestions).toHaveLength(1);
    expect(mock.generate).toHaveBeenCalledTimes(3);
  });

  it('withholds everything with a clear message when the audit fails twice', async () => {
    const w = withAnswer(fixture(), 'They approved the budget.');
    reply({ suggestions: [{ line: 1, after: 'Prepared monthly reports that the board used to approve the budget', reason: 'r', sources: [{ source: 'improve.a1', quote: 'approved the budget' }] }] });
    fail(); fail();
    const result = await improveSuggestions(w, 'experience.e1');
    expect(result.suggestions).toEqual([]);
    expect(result.notices.join(' ')).toContain('could not be checked');
  });

  it('keeps the same skills when grouping and rejects added skills', async () => {
    const w = fixture();
    reply({ suggestion: { after: 'Other: Stakeholder management\nTools: Reporting, Power BI', reason: 'Grouped', sources: [{ source: 'skills', quote: 'Reporting' }] } });
    reply({ suggestion: { after: 'Other: Stakeholder management\nTools: Reporting, Power BI', reason: 'Grouped', sources: [{ source: 'skills', quote: 'Reporting' }] } });
    const added = await improveSuggestions(w, 'skills');
    expect(added.suggestions).toEqual([]);
    expect(added.notices.join(' ')).toContain('exactly the same skills');
    reply({ suggestion: { after: 'Other: Stakeholder management\nTools: Reporting', reason: 'Grouped', sources: [{ source: 'skills', quote: 'Reporting' }] } });
    reply({ checks: [{ id: 'skills', supported: true, reason: 'ok' }] });
    const grouped = await improveSuggestions(w, 'skills');
    expect(grouped.suggestions[0]).toMatchObject({ field: 'skills', line: null, after: 'Other: Stakeholder management\nTools: Reporting' });
  });

  const twoRoles = (): Workspace => {
    const w = fixture();
    w.resume.experience.push({ id: 'e2', company: 'Other Ltd', title: 'Analyst', location: 'Abuja', startDate: '2018', endDate: '2020', achievements: 'Built dashboards.' });
    return w;
  };
  const okChecks = (id: string) => reply({ checks: [{ id, supported: true, reason: 'ok' }] });
  const lineDraft = (n: number, after: string, source: string, quote: string) => ({ line: n, after, reason: 'r', sources: [{ source, quote }] });

  it('keeps only the first draft for each line', async () => {
    const w = withAnswer(fixture(), 'They approved the budget.');
    reply({ suggestions: [lineDraft(1, 'Prepared monthly reports that the board used to approve the budget', 'improve.a1', 'approved the budget'), lineDraft(1, 'Produced monthly reports so the board could approve the budget', 'improve.a1', 'approved the budget')] });
    okChecks('experience.e1.achievements#1');
    const { suggestions } = await improveSuggestions(w, 'experience.e1');
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].after).toContain('Prepared monthly');
  });

  it('withholds a draft citing another role answer or the notes', async () => {
    const w = twoRoles();
    w.evidenceNotes = 'I secretly ran the whole department.';
    w.improve = { answers: [{ id: 'a2', target: 'experience.e2', bullet: '', question: 'q', answer: 'Dashboards used by the finance team.', number: 'none', status: 'answered' }] };
    const other = lineDraft(1, 'Prepared monthly reports used by the finance team', 'improve.a2', 'used by the finance team');
    reply({ suggestions: [other] }); reply({ suggestions: [other] });
    const crossRole = await improveSuggestions(w, 'experience.e1');
    expect(crossRole.suggestions).toEqual([]);
    expect(crossRole.notices.join(' ')).toContain('word for word');
    const notes = lineDraft(1, 'Prepared monthly reports and ran the whole department', 'notes', 'ran the whole department');
    reply({ suggestions: [notes] }); reply({ suggestions: [notes] });
    const fromNotes = await improveSuggestions(w, 'experience.e1');
    expect(fromNotes.suggestions).toEqual([]);
    expect(fromNotes.notices.join(' ')).toContain('word for word');
  });

  it('does not let another role approximate answer force a qualifier', async () => {
    const w = twoRoles();
    w.improve = { answers: [
      { id: 'a1', target: 'experience.e1', bullet: '', question: 'q', answer: 'I sent reports to 20 managers', number: 'exact', status: 'answered' },
      { id: 'a2', target: 'experience.e2', bullet: '', question: 'q', answer: 'About 20 users', number: 'approximate', status: 'answered' },
    ] };
    reply({ suggestions: [lineDraft(1, 'Prepared monthly reports for 20 managers', 'improve.a1', 'sent reports to 20 managers')] });
    okChecks('experience.e1.achievements#1');
    const { suggestions } = await improveSuggestions(w, 'experience.e1');
    expect(suggestions).toHaveLength(1);
  });

  it('only replaces drafts that needed repair', async () => {
    const w = fixture();
    reply({ suggestions: [lineDraft(0, 'Managed a ₦2,000,000 budget', 'experience.e1', 'Managed a budget of ₦2,000,000.'), lineDraft(1, 'Prepared monthly reports for 9 stakeholders', 'experience.e1', 'Prepared monthly reports for 4 stakeholders.')] });
    reply({ suggestions: [lineDraft(0, 'Managed a budget that was different', 'experience.e1', 'Managed a budget of ₦2,000,000.'), lineDraft(1, 'Prepared monthly reports for 4 stakeholders each month', 'experience.e1', 'Prepared monthly reports for 4 stakeholders.')] });
    reply({ checks: [{ id: 'experience.e1.achievements#0', supported: true, reason: 'ok' }, { id: 'experience.e1.achievements#1', supported: true, reason: 'ok' }] });
    const { suggestions } = await improveSuggestions(w, 'experience.e1');
    expect(suggestions.find(s => s.line === 0)?.after).toBe('Managed a ₦2,000,000 budget');
    expect(suggestions.find(s => s.line === 1)?.after).toBe('Prepared monthly reports for 4 stakeholders each month');
  });

  it('rejects a one-line suggestion that spans several lines', async () => {
    const w = withAnswer(fixture(), 'They approved the budget.');
    const multi = lineDraft(1, 'Prepared monthly reports\nthat the board approved', 'improve.a1', 'approved the budget');
    reply({ suggestions: [multi] }); reply({ suggestions: [multi] });
    const result = await improveSuggestions(w, 'experience.e1');
    expect(result.suggestions).toEqual([]);
    expect(result.notices.join(' ')).toContain('one line');
  });

  it('gives a clear error when the first reply cannot be read', async () => {
    const w = fixture();
    reply({ nonsense: true });
    await expect(improveSuggestions(w, 'experience.e1')).rejects.toThrow('could not be read');
    fail();
    await expect(improveSuggestions(w, 'experience.e1')).rejects.toThrow('provider down');
    mock.generate.mockResolvedValueOnce({ text: 'not json at all', finishReason: 'stop' }).mockResolvedValueOnce({ text: 'still not json', finishReason: 'stop' });
    await expect(improveSuggestions(w, 'experience.e1')).rejects.toThrow('could not be read');
  });

  it('keeps the AI setup message instead of calling it unreadable', async () => {
    mock.config.mockResolvedValue(null);
    await expect(improveSuggestions(fixture(), 'experience.e1')).rejects.toThrow('in Settings');
  });

  it('says so when nothing is suggested', async () => {
    reply({ suggestions: [] });
    const result = await improveSuggestions(fixture(), 'experience.e1');
    expect(result.suggestions).toEqual([]);
    expect(result.notices.join(' ')).toContain('No changes were suggested');
  });

  it('normalises dashes in the reason', async () => {
    const w = withAnswer(fixture(), 'They approved the budget.');
    reply({ suggestions: [{ ...lineDraft(1, 'Prepared monthly reports that the board used to approve the budget', 'improve.a1', 'approved the budget'), reason: 'Adds the result — clearly' }] });
    okChecks('experience.e1.achievements#1');
    const { suggestions } = await improveSuggestions(w, 'experience.e1');
    expect(suggestions[0].reason).not.toContain('—');
  });

  it('uses fallback questions when the AI gives fewer than two, drops duplicates and matches bulleted lines', async () => {
    const w = fixture();
    reply({ questions: [{ bullet: '', question: 'Only one?', why: '' }] });
    expect((await improveQuestions(w, 'experience.e1')).fallback).toBe(true);
    reply({ questions: [{ bullet: '', question: 'Same?', why: '' }, { bullet: '', question: 'same?', why: '' }] });
    expect((await improveQuestions(w, 'experience.e1')).fallback).toBe(true);
    const bulleted = fixture();
    bulleted.resume.experience[0].achievements = '• Managed a budget of ₦2,000,000.\n- Prepared monthly reports for 4 stakeholders.';
    reply({ questions: [{ bullet: 'Prepared monthly reports for 4 stakeholders.', question: 'Who read them?', why: '' }, { bullet: '', question: 'What changed?', why: '' }] });
    const asked = await improveQuestions(bulleted, 'experience.e1');
    expect(asked.questions[0].bullet).toBe('- Prepared monthly reports for 4 stakeholders.');
  });

  it('filters fallback questions already asked, but returns them all if every one was asked', async () => {
    const w = fixture();
    const fixed = [
      'What did you personally do in this role that you are proudest of?',
      'What changed because of it (time saved, money, quality, people helped)?',
      'How do you know it worked (a report, feedback, a measure)?',
      'How big was it: people, money, time or volume? An estimate is fine; mark it Approximate.',
    ];
    const answered = (qs: string[]): Workspace => ({ ...w, improve: { answers: qs.map((question, i) => ({ id: 'q' + i, target: 'experience.e1', bullet: '', question, answer: '', number: 'none' as const, status: 'skipped' as const })) } });
    fail();
    expect((await improveQuestions(answered(fixed.slice(0, 1)), 'experience.e1')).questions).toHaveLength(3);
    fail();
    expect((await improveQuestions(answered(fixed), 'experience.e1')).questions).toHaveLength(4);
  });
});
