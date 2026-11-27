import { describe, expect, it } from 'vitest';
import { changedLines, normalizeChangedLines, normalizeVoice, voiceBrief, voiceIssues, voiceMessages } from './human-voice';

const rules = (text: string, kind: Parameters<typeof voiceIssues>[1] = 'letter', sources = '', tone?: 'direct' | 'warm' | 'formal') => voiceIssues(text, kind, sources, tone).map(i => i.rule);

describe('normalizeVoice', () => {
  it('replaces dashes, curly quotes, the ellipsis character and repeated spaces', () => {
    expect(normalizeVoice('I led the plan — and it worked')).toBe('I led the plan, and it worked');
    expect(normalizeVoice('Budget—on time')).toBe('Budget, on time');
    expect(normalizeVoice('2019–2021 and 5 – 7 teams')).toBe('2019-2021 and 5-7 teams');
    expect(normalizeVoice('It ran – smoothly')).toBe('It ran, smoothly');
    expect(normalizeVoice('“Hello” it’s fine…  ok')).toBe('"Hello" it\'s fine... ok');
    expect(normalizeVoice('Done —, then')).toBe('Done, then');
  });
  it('never turns a range into a list', () => {
    const cases: [string, string][] = [
      ['Q1–Q3 2023', 'Q1-Q3 2023'],
      ['Jan–Jun 2024', 'Jan-Jun 2024'],
      ['January – June', 'January-June'],
      ['£2m–£3m budget', '£2m-£3m budget'],
      ['10%–15% growth', '10%-15% growth'],
      ['$5 – $7', '$5-$7'],
      ['2019—2021', '2019-2021'],
      ['Jan 2020 – Present', 'Jan 2020-Present'],
      ['a change of –5%', 'a change of -5%'],
      ['– Led the team', '- Led the team'],
      ['I led the plan — and it worked', 'I led the plan, and it worked'],
    ];
    for (const [input, expected] of cases) expect(normalizeVoice(input)).toBe(expected);
  });
  it('keeps a spaced em dash as an aside and handles more range tokens', () => {
    const cases: [string, string][] = [
      ['Saved £40k — 20% of the budget', 'Saved £40k, 20% of the budget'],
      ['Cut costs by 15% — 3 months early', 'Cut costs by 15%, 3 months early'],
      ['In May — 3 weeks early', 'In May, 3 weeks early'],
      ['2019—2021', '2019-2021'],
      ['$5 – $7', '$5-$7'],
      ['FY22–FY24', 'FY22-FY24'],
      ['Mon–Fri', 'Mon-Fri'],
      ['9am–5pm', '9am-5pm'],
      ['Sept–Dec', 'Sept-Dec'],
      ['H1–H2', 'H1-H2'],
      ['1st–3rd', '1st-3rd'],
    ];
    for (const [input, expected] of cases) expect(normalizeVoice(input)).toBe(expected);
  });
  it('flags rather-than and not-just contrasts whatever the sentence opener', () => {
    expect(rules('As lead, I chose a phased rollout rather than a big bang.')).toContain('not-x-but-y');
    expect(rules('After the audit, I chose speed rather than scope.')).toContain('not-x-but-y');
    expect(rules('When I joined, it was not just a launch but a reset.')).toContain('not-x-but-y');
  });
  it('treats a line that only gained trailing whitespace as unchanged', () => {
    expect(normalizeChangedLines('Kept — as typed', 'Kept — as typed ')).toBe('Kept — as typed');
    expect(changedLines('a\nb', 'a \nc')).toBe('c');
  });
  it('only touches lines that changed', () => {
    expect(normalizeChangedLines('Kept — as typed\nOld line', 'Kept — as typed\nNew — line')).toBe('Kept — as typed\nNew, line');
    expect(changedLines('a\nb', 'a\nc\nd')).toBe('c\nd');
  });
});

describe('voiceIssues', () => {
  it('flags banned words and phrases with their inflections', () => {
    expect(rules('We leveraged data to foster growth.')).toEqual(expect.arrayContaining(['banned:leverage', 'banned:foster']));
    expect(rules('I hope this email finds you well.')).toContain('stock:i hope this email finds you');
    expect(rules('Best regards,\nAda')).toContain('stock:best regards');
  });
  it('allows a banned word that already appears in the user\'s own text', () => {
    expect(rules('I briefed 4 stakeholders on each milestone.', 'letter', 'Prepared reports for 4 stakeholders and every milestone')).toEqual([]);
    expect(rules('I briefed stakeholders.', 'letter', '')).toContain('banned:stakeholder');
  });
  it('accepts any form of a banned word the user already uses', () => {
    expect(rules('I hit each milestone.', 'letter', 'Delivered all milestones')).not.toContain('banned:milestone');
    expect(rules('I briefed stakeholders', 'letter', 'key stakeholder')).toEqual([]);
    expect(rules('I championed the change', 'letter', 'champion change')).toEqual([]);
    expect(rules('I briefed a stakeholder.', 'letter', '')).toContain('banned:stakeholder');
  });
  it('does not flag Oxford comma look-alikes before a clause', () => {
    expect(rules('After that, I joined Acme, and we grew revenue.')).not.toContain('oxford-comma');
    expect(rules('As lead, I ran planning, and the team delivered early.')).not.toContain('oxford-comma');
    expect(rules('Yes, I did, and it worked.')).not.toContain('oxford-comma');
  });
  it('does not flag concessions as not-x-but-y', () => {
    expect(rules('Although the role was not client-facing, it was close to sales.')).not.toContain('not-x-but-y');
    expect(rules('When the release was not ready, it was moved to March.')).not.toContain('not-x-but-y');
    expect(rules('The project was not on track. It was three weeks late, so I reset the plan.')).not.toContain('not-x-but-y');
    expect(rules('This isn\'t about speed. It\'s about trust.')).toContain('not-x-but-y');
  });
  it('matches phrases on word boundaries', () => {
    expect(rules('The main addition was a review.')).not.toContain('phrase:in addition');
    expect(rules('The domain summary was short.')).not.toContain('phrase:in summary');
    expect(rules('In summary, I led it.')).toContain('phrase:in summary');
  });
  it('checks ing-tail only for prose kinds', () => {
    expect(rules('Cut processing time by 30%, contributing to £2m savings', 'bullet')).not.toContain('ing-tail');
    expect(rules('Cut processing time by 30%, contributing to £2m savings.', 'summary')).toContain('ing-tail');
  });
  it('does not split sentences on abbreviations', () => {
    expect(rules('Dear Ms Bello,\n\nI worked with Dr. Bello on the audit.\n\nKind regards,\nAda')).toContain('one-sentence-paragraph');
  });
  it('straightens curly apostrophes before contraction checks', () => {
    expect(rules('Dear Ms Bello,\n\nI’m keen. I can’t wait to start the work.\n\nKind regards,\nAda', 'letter', '', 'formal')).toContain('formal-contractions');
    expect(rules('This isn’t about speed. It’s about trust.')).toContain('not-x-but-y');
  });
  it('flags semicolons, Oxford commas and contrast set-ups', () => {
    expect(rules('I planned it; it shipped.')).toContain('semicolon');
    expect(rules('I managed scope, budget, and risk.')).toContain('oxford-comma');
    expect(rules('I managed scope, budget and risk.')).not.toContain('oxford-comma');
    expect(rules('In Lagos, I led the team, and we delivered.')).not.toContain('oxford-comma');
    expect(rules('It was not just a launch but a reset.')).toContain('not-x-but-y');
    expect(rules('This isn\'t about speed. It\'s about trust.')).toContain('not-x-but-y');
    expect(rules('I chose phased rollout rather than a big bang.')).toContain('not-x-but-y');
    expect(rules('The result? Fewer delays.')).toContain('self-question');
    expect(rules('Describe the situation and your action. What was the result?')).not.toContain('self-question');
    expect(rules('Explain the problem? Then fix it.')).not.toContain('self-question');
    expect(rules('We shipped it. The kicker? It was early.')).toContain('self-question');
  });
  it('voiceBrief accepts several kinds and emits the shared block once', () => {
    const both = voiceBrief(['bullet', 'summary']);
    expect(both.match(/WRITING VOICE/g)).toHaveLength(1);
    expect(both).toContain('CV BULLETS');
    expect(both).toContain('NARRATIVE PROSE: Write 2 to 3');
  });
  it('flags trailing -ing commentary and repeated sentence openings', () => {
    expect(rules('I cut costs by 10%, highlighting my focus on value.')).toContain('ing-tail');
    expect(rules('Furthermore, I led it. Moreover, I ran it.')).toContain('adverb-starters');
    expect(rules('I led it. I ran it. I closed it.')).toContain('same-openers');
  });
  it('checks letter paragraphs and formal contractions as warnings only', () => {
    const letter = 'Dear Ms Bello,\n\nI led the rollout.\n\nI managed the budget and reported monthly. The board approved it.\n\nKind regards,\nAda';
    const issues = voiceIssues(letter, 'letter');
    expect(issues.find(i => i.rule === 'one-sentence-paragraph')?.repairable).toBe(false);
    expect(rules('Dear Ms Bello,\n\nI\'m keen. I can\'t wait to start the work.\n\nKind regards,\nAda', 'letter', '', 'formal')).toContain('formal-contractions');
    expect(rules('Dear Ms Bello,\n\nI\'m ready to start. I can begin in March.\n\nKind regards,\nAda', 'letter', '', 'warm')).not.toContain('formal-contractions');
  });
  it('applies only word and punctuation rules to bullets and headlines', () => {
    expect(rules('Led rollout. Led audit. Led review.', 'bullet')).toEqual([]);
    expect(rules('Spearheaded a robust rollout', 'bullet')).toEqual(expect.arrayContaining(['banned:spearhead', 'banned:robust']));
  });
  it('marks word, phrase and punctuation tells as repairable and gives readable messages', () => {
    const issues = voiceIssues('We leveraged data; it was not just fast but cheap.', 'summary');
    expect(issues.every(i => i.repairable)).toBe(true);
    expect(voiceMessages(issues).join(' ')).toContain('"leveraged"');
  });
});

describe('voiceBrief', () => {
  it('includes narrative rules for letters and summaries, and short CV form for bullets', () => {
    expect(voiceBrief('letter', 'formal')).toContain('Do not use contractions');
    expect(voiceBrief('letter', 'warm')).toContain('Use natural contractions');
    expect(voiceBrief('summary')).toContain('complete, connected sentences');
    expect(voiceBrief('bullet')).toContain('short CV form');
    for (const kind of ['letter', 'summary', 'bullet', 'headline', 'guidance'] as const) expect(voiceBrief(kind)).toContain('semicolons');
  });
});
