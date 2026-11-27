import { describe, expect, it } from 'vitest';
import { LESSON_STYLE_RULE, removeEmDashes } from './lesson-style';

describe('removeEmDashes', () => {
  it('turns an aside dash into a comma', () => {
    expect(removeEmDashes('Members are 100% dedicated to one team — colocated in a shared space.')).toBe(
      'Members are 100% dedicated to one team, colocated in a shared space.'
    );
    expect(removeEmDashes('two half-resources—it is getting two partial resources')).toBe(
      'two half-resources, it is getting two partial resources'
    );
  });

  it('turns a pair of dashes around an aside into brackets', () => {
    expect(removeEmDashes('Agile teams own all skills — designers, developers, testers — together.')).toBe(
      'Agile teams own all skills (designers, developers, testers) together.'
    );
  });

  it('uses a colon after a bold label and in a heading', () => {
    expect(removeEmDashes('1. **Open communication** — PMI calls this the cornerstone.')).toBe(
      '1. **Open communication**: PMI calls this the cornerstone.'
    );
    expect(removeEmDashes('- **Trust** — teams that trust each other')).toBe('- **Trust**: teams that trust each other');
    expect(removeEmDashes('### Management vs. Leadership — Know the Chart')).toBe('### Management vs. Leadership: Know the Chart');
  });

  it('writes number ranges with a hyphen', () => {
    expect(removeEmDashes('losses of 20%—40% when switching, from 2019 — 2021')).toBe(
      'losses of 20%-40% when switching, from 2019-2021'
    );
  });

  it('handles a dash at the start of a line, an empty table cell, and a dash before punctuation', () => {
    expect(removeEmDashes('— PMI, 2021')).toBe('- PMI, 2021');
    expect(removeEmDashes('| Speed | — |')).toBe('| Speed | - |');
    expect(removeEmDashes('Notice the outcome —.')).toBe('Notice the outcome.');
  });

  it('leaves code blocks, en dashes, hyphens and text without em dashes untouched', () => {
    const code = '```\nx — y\n```';
    expect(removeEmDashes(code)).toBe(code);
    expect(removeEmDashes('pages 10–12 and a well-known fact.')).toBe('pages 10–12 and a well-known fact.');
    expect(removeEmDashes('Plain text.\n\nSecond paragraph.')).toBe('Plain text.\n\nSecond paragraph.');
  });

  it('keeps line breaks and Markdown structure', () => {
    const lesson = '## Title\n\nIntro — more.\n\n- one — two\n- three';
    expect(removeEmDashes(lesson)).toBe('## Title\n\nIntro, more.\n\n- one, two\n- three');
  });

  it('never leaves an em dash behind', () => {
    const messy = '— a — b — c —— d —\n**x** — y — z\n# H — I —';
    expect(removeEmDashes(messy)).not.toContain('—');
  });
});

describe('LESSON_STYLE_RULE', () => {
  it('asks for no em dashes and contains none itself', () => {
    expect(LESSON_STYLE_RULE).toMatch(/em dash/i);
    expect(LESSON_STYLE_RULE).not.toContain('—');
  });
});
