import { describe, it, expect } from 'vitest';
import {
  accentIds, accentPresets, colourCheck, contrastRatio, normalizeHex, fontPairIds, fontPairs, LEGACY_TINT, pdfFamilyName,
  resolveAccent, resolveFonts, shadeTint, type FontPairId,
} from './design';
import { templateIds, templates } from './templates';

describe('colours', () => {
  it('keeps the three original colours and their shaded band exactly as before', () => {
    expect(resolveAccent({ accent: 'teal' })).toEqual({ hex: '#175e59', tint: '#edf2f1' });
    expect(resolveAccent({ accent: 'navy' })).toEqual({ hex: '#213e64', tint: '#edf2f1' });
    expect(resolveAccent({ accent: 'slate' })).toEqual({ hex: '#414b58', tint: '#edf2f1' });
  });

  it('gives the new colours a light tint of themselves', () => {
    expect(resolveAccent({ accent: 'burgundy' })).toEqual({ hex: '#7a2335', tint: shadeTint('#7a2335') });
    expect(shadeTint('#000000')).toBe('#ebebeb');
    expect(shadeTint('#ffffff')).toBe('#ffffff');
  });

  it('computes WCAG contrast ratios', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });

  it('accepts every preset and dark custom colours, and rejects light or invalid ones', () => {
    for (const id of accentIds) expect(colourCheck(accentPresets[id].hex).ok).toBe(true);
    expect(colourCheck('#C2410C')).toEqual({ ok: true, message: 'Readable: headings and banner text stay clear.' });
    expect(colourCheck('#F4B740')).toEqual({ ok: false, message: 'Too light to read on a white page. Pick a darker shade.' });
    for (const bad of ['', 'red', '#fff', '#12345g', '123456']) expect(colourCheck(bad)).toEqual({ ok: false, message: 'Enter a colour as #RRGGBB.' });
  });

  it('renders a missing, invalid or unreadable custom colour as Deep teal', () => {
    for (const customAccent of [undefined, 'junk', '#f4b740']) {
      expect(resolveAccent({ accent: 'custom', customAccent })).toEqual({ hex: '#175e59', tint: LEGACY_TINT });
    }
    expect(resolveAccent({ accent: 'custom', customAccent: '#C2410C' })).toEqual({ hex: '#c2410c', tint: shadeTint('#c2410c') });
  });
});

describe('fonts', () => {
  const all = () => true;
  const none = () => false;
  const studio = (serif: boolean) => (serif ? 'StudioSerif' : 'StudioSans');

  it("keeps every template's own fonts when no pair is chosen", () => {
    for (const id of templateIds) {
      const t = templates[id];
      expect(resolveFonts({ template: id }, all)).toEqual({
        pdf: {
          heading: { regular: studio(t.display === 'serif'), bold: studio(t.display === 'serif') },
          body: { regular: studio(t.body === 'serif'), bold: studio(t.body === 'serif') },
        },
        word: { heading: t.display === 'serif' ? 'Times New Roman' : 'Calibri', body: t.body === 'serif' ? 'Times New Roman' : 'Calibri' },
        css: null, faces: [], fallback: false,
      });
      expect(resolveFonts({ template: id }, none).pdf.body).toEqual(t.body === 'serif' ? { regular: 'Times-Roman', bold: 'Times-Bold' } : { regular: 'Helvetica', bold: 'Helvetica-Bold' });
    }
  });

  it('maps every pair to its Word names, CSS stacks and registered PDF families', () => {
    const word: Record<FontPairId, [string, string]> = {
      calibri: ['Calibri', 'Calibri'], 'georgia-calibri': ['Georgia', 'Calibri'], garamond: ['Garamond', 'Garamond'],
      palatino: ['Palatino Linotype', 'Palatino Linotype'], 'constantia-corbel': ['Constantia', 'Corbel'],
      trebuchet: ['Trebuchet MS', 'Trebuchet MS'], georgia: ['Georgia', 'Georgia'], verdana: ['Verdana', 'Verdana'],
    };
    for (const id of fontPairIds) {
      const r = resolveFonts({ template: 'executive', fontPair: id }, all);
      expect([r.word.heading, r.word.body]).toEqual(word[id]);
      expect(r.css).toEqual({ heading: fontPairs[id].heading.css, body: fontPairs[id].body.css });
      expect(r.css!.heading).toMatch(/(serif|sans-serif)$/);
      expect(r.css!.body).toMatch(/(serif|sans-serif)$/);
      expect(r.pdf.heading).toEqual({ regular: pdfFamilyName(fontPairs[id].heading), bold: pdfFamilyName(fontPairs[id].heading) });
      expect(r.pdf.body.regular).toBe(pdfFamilyName(fontPairs[id].body));
      expect(r.fallback).toBe(false);
    }
    expect(resolveFonts({ template: 'executive', fontPair: 'georgia-calibri' }, all).faces.map(f => f.word)).toEqual(['Georgia', 'Calibri']);
    expect(resolveFonts({ template: 'executive', fontPair: 'garamond' }, all).faces).toHaveLength(1);
    expect(pdfFamilyName(fontPairs.garamond.body)).toBe('Pair-GARA');
  });

  it("uses the template's PDF fonts when a pair's font file is missing", () => {
    const r = resolveFonts({ template: 'classic', fontPair: 'garamond' }, path => !path.endsWith('GARABD.TTF'));
    expect(r.fallback).toBe(true);
    expect(r.faces).toEqual([]);
    expect(r.pdf.body).toEqual({ regular: 'StudioSerif', bold: 'StudioSerif' });
    expect(r.word).toEqual({ heading: 'Garamond', body: 'Garamond' });
    expect(r.css).toEqual({ heading: fontPairs.garamond.heading.css, body: fontPairs.garamond.body.css });
  });
});

describe('normalizeHex (typed custom colours)', () => {
  it('accepts a six-digit code with or without the #, in any case, as lower case with #', () => {
    expect(normalizeHex('c2410c')).toBe('#c2410c');
    expect(normalizeHex('#C2410C')).toBe('#c2410c');
    expect(normalizeHex('  213e64 ')).toBe('#213e64');
  });

  it('leaves anything else alone, including a part-typed or three-digit code', () => {
    for (const value of ['', '#', 'c24', '#c24', 'c2410', 'c2410cz', 'navy', '#ggg000']) expect(normalizeHex(value)).toBeNull();
  });
});
