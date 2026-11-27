import { describe, expect, it } from 'vitest';
import { parseStageSources, stageSourceList } from './stage-sources';

describe('stage source list', () => {
  it('groups document chunks by file with each section once, in chunk order', () => {
    expect(stageSourceList([
      { sourceDocument: 'plan.pdf', sourceSection: 'Scope' },
      { sourceDocument: 'notes.docx', sourceSection: 'Intro' },
      { sourceDocument: 'plan.pdf', sourceSection: 'Risks' },
      { sourceDocument: 'plan.pdf', sourceSection: 'Scope' },
    ])).toEqual({
      documents: [{ name: 'plan.pdf', sections: ['Scope', 'Risks'] }, { name: 'notes.docx', sections: ['Intro'] }],
      web: [],
    });
  });

  it('lists topic-only (web) chunks by title, once each, skipping blanks', () => {
    expect(stageSourceList([
      { sourceDocument: '', sourceSection: 'What is a RACI chart?' },
      { sourceDocument: '  ', sourceSection: 'What is a RACI chart?' },
      { sourceDocument: '', sourceSection: ' ' },
      { sourceDocument: '', sourceSection: 'RACI vs RASCI' },
    ])).toEqual({ documents: [], web: [{ title: 'What is a RACI chart?' }, { title: 'RACI vs RASCI' }] });
  });

  it('reads well-formed endpoint JSON and rejects anything else', () => {
    const good = { documents: [{ name: 'plan.pdf', sections: ['Scope'] }], web: [{ title: 'A' }] };
    expect(parseStageSources(good)).toEqual(good);
    expect(parseStageSources(null)).toBeNull();
    expect(parseStageSources({ error: 'Stage not found.' })).toBeNull();
    expect(parseStageSources({ documents: [{ name: 'x', sections: [1] }], web: [] })).toBeNull();
  });
});
