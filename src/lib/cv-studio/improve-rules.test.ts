import { describe, expect, it } from 'vitest';
import { fixture } from './test-fixture';
import { evidenceCatalog, targetText, WorkspaceSchema } from './schema';
import {
  applyImprove, approximateNumbers, improveAnswerId, upsertImproveAnswer, fallbackQuestions, headlineNewWords, improveItems, missingApproximations, ownershipFlags,
  replaceLine, sameSkills, skillItems, STALE_IMPROVE, unsupportedNumbers, wordsToDigits, writtenNumbers,
} from './improve-rules';
import { improveCatalog, type ImproveAnswer } from './improve-schema';

const answer = (patch: Partial<ImproveAnswer>): ImproveAnswer => ({ id: 'a1', target: 'experience.e1', bullet: '', question: 'How many?', answer: '', number: 'none', status: 'answered', ...patch });

describe('improve data', () => {
  it('keeps old CVs valid and adds answered improve answers to the evidence catalog', () => {
    const old = fixture();
    expect(WorkspaceSchema.parse(old).improve).toBeUndefined();
    const w = WorkspaceSchema.parse({ ...old, improve: { answers: [answer({ answer: 'About 20 vendors' }), answer({ id: 'a2', status: 'skipped', answer: 'x' }), answer({ id: 'a3', status: 'draft', answer: 'y' })] } });
    // Improve answers stay in Improve: tailoring, letters and practice never see them.
    expect(Object.keys(evidenceCatalog(w)).filter(k => k.startsWith('improve.'))).toEqual([]);
    const catalog = improveCatalog(w);
    expect(catalog['improve.a1']).toBe('About 20 vendors');
    expect(catalog['improve.a2']).toBeUndefined();
    expect(catalog['improve.a3']).toBeUndefined();
    expect(() => WorkspaceSchema.parse({ ...old, improve: { answers: [answer({}), answer({})] } })).toThrow();
  });
  it('ignores a leading "and" or "or" when comparing skills', () => {
    expect(skillItems('Python, SQL, and R')).toEqual(skillItems('Python, SQL, R'));
    expect(skillItems('Python, SQL, or R')).toEqual(skillItems('Python, SQL, R'));
  });
  it('reads and writes volunteering achievements and the headline', () => {
    const w = fixture();
    w.resume.volunteering = [{ id: 'v1', role: 'Mentor', organisation: 'Code Club', location: '', startDate: '', endDate: '', achievements: 'Ran sessions\nTaught students' }];
    expect(targetText(w.resume, 'volunteering.v1.achievements')).toBe('Ran sessions\nTaught students');
    expect(targetText(w.resume, 'personal.professionalTitle')).toBe(w.resume.personal.professionalTitle);
    const next = applyImprove(w.resume, { field: 'volunteering.v1.achievements', line: 1, before: 'Taught students', after: 'Taught 20 students' });
    expect(next.volunteering[0].achievements).toBe('Ran sessions\nTaught 20 students');
    const titled = applyImprove(w.resume, { field: 'personal.professionalTitle', line: null, before: w.resume.personal.professionalTitle, after: 'Programme Manager' });
    expect(titled.personal.professionalTitle).toBe('Programme Manager');
  });
  it('refuses a stale change', () => {
    const w = fixture();
    const field = 'experience.e1.achievements';
    expect(() => applyImprove(w.resume, { field, line: 0, before: 'Not the current line', after: 'x' })).toThrow(STALE_IMPROVE);
    expect(() => applyImprove(w.resume, { field: 'summary', line: null, before: 'old summary', after: 'x' })).toThrow(STALE_IMPROVE);
    expect(replaceLine('a\nb', 1, 'b', 'c')).toBe('a\nc');
  });
});

describe('fix round: words, ranges, ownership, skills, input safety', () => {
  it('gates numbers written as words in the after text', () => {
    expect(unsupportedNumbers('Led five teams', 'Led six teams')).toEqual(['6']);
    expect(unsupportedNumbers('Led teams', 'Led thirty people')).toEqual(['30']);
    expect(missingApproximations('Managed twenty vendors', ['20'])).toEqual(['20']);
    expect(unsupportedNumbers('Led five teams', 'Led five teams')).toEqual([]);
    expect(wordsToDigits('Led twenty-five vendors, a hundred days, one of us')).toBe('Led 25 vendors, 100 days, one of us');
  });
  it('emits only the combined value of a number phrase', () => {
    expect(writtenNumbers('twenty-five vendors')).toEqual(['25']);
    expect(writtenNumbers('two hundred staff')).toEqual(['200']);
    expect(writtenNumbers('two hundred and fifty staff')).toEqual(['250']);
    expect(writtenNumbers('five million naira')).toEqual(['5000000']);
    expect(writtenNumbers('a hundred days')).toEqual(['100']);
    expect(writtenNumbers('several hundred users')).toEqual([]);
    expect(writtenNumbers('a few thousand customers')).toEqual([]);
    expect(writtenNumbers('hundreds of users, thousands, millions')).toEqual([]);
    expect(writtenNumbers('One of the team leads ran one-to-one coaching')).toEqual([]);
    expect(unsupportedNumbers('twenty-five vendors', 'Managed 20 vendors across 5 sites')).toEqual(['20', '5']);
    expect(unsupportedNumbers('Served several hundred users', 'Served 100 users')).toEqual(['100']);
    const all = writtenNumbers('I led five teams and twenty-five vendors over a hundred days');
    expect(all).toEqual(['5', '25', '100']);
    expect(all).not.toContain('20');
  });
  it('requires the same words after skill grouping', () => {
    expect(sameSkills('Python, SQL, and R', 'Tools: Python, SQL, R')).toBe(true);
    expect(sameSkills('Python, SQL, and R', 'Tools: Python, SQL')).toBe(false);
    expect(sameSkills('Excel', 'Python: Excel')).toBe(false);
    expect(sameSkills('Excel, Planning', 'Python and SQL: Excel, Planning')).toBe(false);
    expect(sameSkills('ISO 9001: 2015, Excel', 'Standards: 2015, Excel')).toBe(false);
    expect(sameSkills('Planning, Budgeting, Excel', 'Tools: Excel\nOther: Planning, Budgeting')).toBe(true);
    expect(sameSkills('Excel, Planning', 'Leadership: Excel\nPeople Management: Planning')).toBe(false);
    expect(sameSkills('Excel', 'Data Analysis: Excel')).toBe(false);
    expect(sameSkills('Excel', 'Finance and Communication: Excel')).toBe(false);
  });
  it('checks a digit followed by a scale word as the full number', () => {
    expect(unsupportedNumbers('Managed 2 teams', 'Managed a ₦2 million budget')).toEqual(['2000000']);
    expect(unsupportedNumbers('A ₦2 million budget', 'Managed a ₦2 million budget')).toEqual([]);
    expect(unsupportedNumbers('A ₦1.5 million budget', 'Managed a ₦1,500,000 budget')).toEqual([]);
    expect(wordsToDigits('300 thousand users')).toBe('300000 users');
    expect(unsupportedNumbers('Managed a €1,5 million budget', 'Managed a €15 million budget')).toContain('15000000');
    expect(unsupportedNumbers('Raised 2,5 million', 'Raised 25,000,000')).not.toEqual([]);
    expect(unsupportedNumbers('Raised 1,200 thousand', 'Raised 1,200,000')).toEqual([]);
  });
  it('treats from-to as a change, not a range, and handles plus, decimals and at least', () => {
    expect(missingApproximations('Grew the team from 5 to 20 people', ['20'])).toEqual(['20']);
    expect(missingApproximations('Managed 5 to 20 people', ['20'])).toEqual([]);
    expect(missingApproximations('Managed 20+ people', ['20'])).toEqual([]);
    expect(missingApproximations('Saved 20.5 hours', ['20'])).toEqual([]);
    expect(missingApproximations('Raised at least 2,000', ['2000'])).toEqual([]);
  });
  it('flags stronger ownership verbs and qualifiers dropped from sources', () => {
    expect(ownershipFlags('Managed vendors', 'about 20 vendors', 'Managed 20 vendors').join(' ')).toContain('"about"');
    expect(ownershipFlags('Assisted the PMO', '', 'Managing the PMO').join(' ')).toContain('ownership');
    expect(ownershipFlags('Co-led reporting', '', 'Led reporting').join(' ')).toContain('ownership');
    expect(ownershipFlags('Worked on audits', '', 'Owned audits').join(' ')).toContain('ownership');
  });
  it('rejects unsafe line edits and fields Improve does not edit', () => {
    for (const index of [NaN, 2, -1, 0.5]) expect(() => replaceLine('a\nb', index, 'a', 'c')).toThrow(STALE_IMPROVE);
    const w = fixture();
    const first = w.resume.experience[0].achievements.split('\n')[0];
    expect(() => applyImprove(w.resume, { field: 'experience.e1.achievements', line: 0, before: first, after: 'x\ny' })).toThrow('A suggestion for one line must stay on one line.');
    expect(() => applyImprove(w.resume, { field: 'additional', line: null, before: w.resume.additional, after: 'x' })).toThrow(STALE_IMPROVE);
  });
});

describe('improve items', () => {
  it('lists roles, volunteering, projects, summary, headline and skills with a reason', () => {
    const w = fixture();
    w.resume.projects = 'Built a tracker';
    w.resume.experience[0].achievements = 'Responsible for reporting\nPrepared monthly reports for 4 stakeholders.';
    const items = improveItems(w.resume);
    expect(items.map(i => i.target)).toEqual(['experience.e1', 'projects', 'summary', 'headline', 'skills']);
    expect(items[0]).toMatchObject({ field: 'experience.e1.achievements', kind: 'bullets' });
    expect(items[0].reason).toBe('1 of 2 bullets have no number or result; 1 starts with a weak opening');
    expect(improveItems(fixture().resume)[0].reason).toBe('Looks solid; you can still sharpen it.');
    expect(fallbackQuestions()).toHaveLength(4);
  });
});

describe('numbers', () => {
  it('lets a number written as a word become digits, and nothing else', () => {
    expect(writtenNumbers('I led five teams and twenty-five vendors over a hundred days')).toEqual(expect.arrayContaining(['5', '25', '100']));
    expect(unsupportedNumbers('Led five teams', 'Led 5 teams')).toEqual([]);
    expect(unsupportedNumbers('Led five teams', 'Led 6 teams')).toEqual(['6']);
  });
  it('keeps a qualifier or a range on approximate numbers', () => {
    const nums = approximateNumbers([answer({ answer: 'roughly 20 vendors, about ₦2,000,000', number: 'approximate' }), answer({ id: 'b', answer: 'exactly 7', number: 'exact' })]);
    expect(nums).toEqual(expect.arrayContaining(['20', '2000000']));
    expect(nums).not.toContain('7');
    expect(missingApproximations('Managed about 20 vendors and about ₦2,000,000', nums)).toEqual([]);
    expect(missingApproximations('Managed 15-20 vendors', ['20'])).toEqual([]);
    expect(missingApproximations('Managed 20 vendors', ['20'])).toEqual(['20']);
  });
});

describe('ownership and skills', () => {
  it('flags upgraded ownership and dropped qualifiers', () => {
    expect(ownershipFlags('Assisted the PMO with reporting', '', 'Led PMO reporting').join(' ')).toContain('"Assisted"');
    expect(ownershipFlags('Led PMO reporting', '', 'Led PMO reporting for 4 teams')).toEqual([]);
    expect(ownershipFlags('Managed about 20 vendors', '', 'Managed 20 vendors').join(' ')).toContain('"about"');
  });
  it('requires exactly the same skills after grouping', () => {
    expect(skillItems('Delivery: Planning, Budgeting\nTools: Excel')).toEqual(['budgeting', 'excel', 'planning']);
    expect(sameSkills('Planning, Budgeting, Excel', 'Tools: Excel\nOther: Planning, Budgeting')).toBe(true);
    expect(sameSkills('Planning, Excel', 'Other: Planning\nTools: Excel, Power BI')).toBe(false);
  });
  it('allows only headline words already in the CV', () => {
    const w = fixture();
    expect(headlineNewWords(w.resume, 'Project Manager · Reporting')).toEqual([]);
    expect(headlineNewWords(w.resume, 'Chief Transformation Officer')).toEqual(expect.arrayContaining(['chief', 'transformation', 'officer']));
  });
});

describe('improve answer ids and storing answers', () => {
  const uuid = '123e4567-e89b-12d3-a456-426614174000';
  const shared = 'What did you personally do in this role that you ';
  it('gives different ids to questions that share a long prefix, even under a long target', () => {
    const a = improveAnswerId('experience.' + uuid, shared + 'are proudest of in the first year?');
    const b = improveAnswerId('experience.' + uuid, shared + 'are proudest of in the second year?');
    expect(a).not.toBe(b);
  });
  it('always matches the schema pattern and stays within 80 characters', () => {
    for (const target of ['projects', 'experience.e1', 'experience.' + 'x'.repeat(69), 'volunteering.' + 'y'.repeat(67)]) {
      for (const q of ['?', 'Who used them?', 'z'.repeat(500), '日本語']) {
        const id = improveAnswerId(target, q);
        expect(id).toMatch(/^[a-zA-Z0-9_-]{1,80}$/);
      }
    }
    expect(improveAnswerId('experience.' + 'x'.repeat(69), 'q').length).toBeLessThanOrEqual(80);
  });
  it('is deterministic', () => {
    expect(improveAnswerId('experience.e1', 'Who used them?')).toBe(improveAnswerId('experience.e1', 'Who used them?'));
  });
  it('does not create an empty draft but keeps an existing answer cleared to an empty draft', () => {
    expect(upsertImproveAnswer([], answer({ answer: '  ', status: 'draft' })).answers).toEqual([]);
    expect(upsertImproveAnswer([], answer({ answer: '', number: 'none', status: 'draft' })).answers).toEqual([]);
    const early = upsertImproveAnswer([], answer({ answer: '', number: 'approximate', status: 'draft' })).answers;
    expect(early).toHaveLength(1);
    expect(early[0].number).toBe('approximate');
    const kept = upsertImproveAnswer([answer({ answer: 'x' })], answer({ answer: '', status: 'draft' })).answers;
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ id: 'a1', answer: '', status: 'draft' });
  });
  it('replaces an existing answer in place and stores a skipped one even when empty', () => {
    const list = [answer({ id: 'a1', answer: 'x' }), answer({ id: 'a2', answer: 'y' })];
    expect(upsertImproveAnswer(list, answer({ id: 'a1', answer: 'z' })).answers.map(a => a.answer)).toEqual(['z', 'y']);
    const skipped = upsertImproveAnswer([], answer({ id: 'a3', answer: '', status: 'skipped' }));
    expect(skipped.answers).toHaveLength(1);
  });
  it('refuses a new answer past 150 but still allows editing an existing one', () => {
    const full = Array.from({ length: 150 }, (_, i) => answer({ id: 'a' + i, answer: 'x' }));
    const refused = upsertImproveAnswer(full, answer({ id: 'new', answer: 'y' }));
    expect(refused.answers).toHaveLength(150);
    expect(refused.error).toBe('You have reached the limit of 150 saved answers for this CV. Clear old answers to add more.');
    expect(upsertImproveAnswer(full, answer({ id: 'a5', answer: 'changed' })).error).toBeUndefined();
  });
});

describe('tuned qualifier rule for "co-" and "up to" (shared with tailoring)', () => {
  const dropped = (q: string) => `Drops "${q}" from the original. Keep it if it is true.`;
  it('counts "co-" only as a shared-ownership prefix', () => {
    expect(ownershipFlags('Co-ordinated supplier meetings', '', 'Coordinated supplier meetings')).toEqual([]);
    expect(ownershipFlags('Co-operated with procurement', '', 'Worked with procurement')).toEqual([]);
    expect(ownershipFlags('Co-founded the finance society', '', 'Founded the finance society')).toEqual([dropped('co-')]);
    expect(ownershipFlags('Co-authored the audit report', '', 'Wrote the audit report')).toEqual([dropped('co-')]);
    expect(ownershipFlags('Co-managed 12 vendors', '', 'Managed 12 vendors'))
      .toEqual(['Claims more ownership: the original says "Co-managed", the suggestion says "Managed". Check this is accurate.', dropped('co-')]);
  });
  it('does not read "up to date" or "up-to-date" as "up to"', () => {
    expect(ownershipFlags('Kept customer records up to date', '', 'Maintained customer records')).toEqual([]);
    expect(ownershipFlags('Kept an up-to-date asset register', '', 'Maintained the asset register')).toEqual([]);
    expect(ownershipFlags('Answered up to 60 calls a day', '', 'Answered 60 calls a day')).toEqual([dropped('up to')]);
    expect(ownershipFlags('Answered up to 60 calls and kept logs up to date', '', 'Answered 60 calls and kept logs up to date')).toEqual([dropped('up to')]);
  });
});
