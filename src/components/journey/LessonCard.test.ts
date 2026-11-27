import { describe, it, expect } from 'vitest';
import { parseCitations } from '@/lib/teaching-session-engine/citations';

describe('parseCitations', () => {
  it('strips document citations from content', () => {
    const { cleanedContent } = parseCitations('Risk is important [Document: guide.pdf] in projects.');
    expect(cleanedContent).toBe('Risk is important in projects.');
  });

  it('leaves no space before punctuation where a citation was removed', () => {
    const { cleanedContent } = parseCitations(
      'From the Agile Practice Guide [Document: guide.pdf]: three to nine members [Web: Agile Alliance]. Small teams move fast [Document: guide.pdf], always.'
    );
    expect(cleanedContent).toBe('From the Agile Practice Guide: three to nine members. Small teams move fast, always.');
  });

  it('keeps the line break when a citation starts a line', () => {
    const { cleanedContent } = parseCitations('First line.\n[Document: a.pdf] Second line.');
    expect(cleanedContent).toBe('First line.\n Second line.');
  });

  it('extracts document citation as source', () => {
    const { inlineSources } = parseCitations('See [Document: guide.pdf] for details.');
    expect(inlineSources).toHaveLength(1);
    expect(inlineSources[0]).toEqual({ type: 'document', name: 'guide.pdf' });
  });

  it('extracts web citation as source, with no address made from its name', () => {
    const { inlineSources } = parseCitations('As stated [Web: Wikipedia] here.');
    expect(inlineSources).toHaveLength(1);
    expect(inlineSources[0]).toStrictEqual({ type: 'web', name: 'Wikipedia' });
  });

  it('returns empty arrays when no citations present', () => {
    const { cleanedContent, inlineSources } = parseCitations('No citations here.');
    expect(cleanedContent).toBe('No citations here.');
    expect(inlineSources).toHaveLength(0);
  });

  it('handles multiple citations', () => {
    const { inlineSources } = parseCitations('[Document: a.pdf] and [Web: Reddit]');
    expect(inlineSources).toHaveLength(2);
  });

  it('is case-insensitive for citation type', () => {
    const { inlineSources } = parseCitations('[document: test.pdf]');
    expect(inlineSources[0].type).toBe('document');
  });
});
