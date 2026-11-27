import type { Layout } from './schema';
import { templates } from './templates';

/** Colour presets. The first three are the original accents; their output must never change. */
export const accentIds = ['teal', 'navy', 'slate', 'burgundy', 'forest', 'royal', 'plum', 'petrol', 'umber', 'ink'] as const;
export type AccentPreset = (typeof accentIds)[number];
export const accentPresets: Record<AccentPreset, { name: string; hex: string }> = {
  teal: { name: 'Deep teal', hex: '#175e59' }, navy: { name: 'Navy', hex: '#213e64' }, slate: { name: 'Slate', hex: '#414b58' },
  burgundy: { name: 'Burgundy', hex: '#7a2335' }, forest: { name: 'Forest', hex: '#2f5d3a' }, royal: { name: 'Royal blue', hex: '#1f4e9a' },
  plum: { name: 'Plum', hex: '#5b3a6e' }, petrol: { name: 'Petrol', hex: '#145470' }, umber: { name: 'Umber', hex: '#7a4a1d' },
  ink: { name: 'Ink', hex: '#1d2228' },
};
/** The shaded heading band used by the original three colours. */
export const LEGACY_TINT = '#edf2f1';
/** The colour the custom picker starts from. */
export const DEFAULT_CUSTOM = '#c2410c';
const LEGACY: readonly string[] = ['teal', 'navy', 'slate'];
const HEX = /^#[0-9a-f]{6}$/i;

const channels = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio between two #RRGGBB colours (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** A light tint of the colour (92% white), used behind shaded headings. */
export function shadeTint(hex: string): string {
  return '#' + channels(hex).map(v => Math.round(v * 0.08 + 255 * 0.92).toString(16).padStart(2, '0')).join('');
}

export const colourMessages = {
  ok: 'Readable: headings and banner text stay clear.',
  light: 'Too light to read on a white page. Pick a darker shade.',
  invalid: 'Enter a colour as #RRGGBB.',
};

/** A colour is usable when headings stay readable on white and on its own tint, and white banner text stays readable on it. */
export function colourCheck(hex: string): { ok: boolean; message: string } {
  if (!HEX.test(hex)) return { ok: false, message: colourMessages.invalid };
  const ok = contrastRatio(hex, '#ffffff') >= 4.5 && contrastRatio(hex, shadeTint(hex)) >= 4.5;
  return { ok, message: ok ? colourMessages.ok : colourMessages.light };
}

/** The colour and shaded tint a CV uses. An unusable custom colour renders as Deep teal, never as an error. */
export function resolveAccent(layout: Pick<Layout, 'accent' | 'customAccent'>): { hex: string; tint: string } {
  if (layout.accent === 'custom') {
    const hex = layout.customAccent ?? '';
    return colourCheck(hex).ok ? { hex: hex.toLowerCase(), tint: shadeTint(hex) } : { hex: accentPresets.teal.hex, tint: LEGACY_TINT };
  }
  const hex = accentPresets[layout.accent].hex;
  return { hex, tint: LEGACY.includes(layout.accent) ? LEGACY_TINT : shadeTint(hex) };
}

export type FontFace = { word: string; css: string; files: { regular: string; bold: string } };
const FONT_DIR = 'C:/Windows/Fonts/';
/** The file whose presence means the template fonts (Arial/Times New Roman) can be embedded, as before. */
export const TEMPLATE_FONT_FILE = FONT_DIR + 'arial.ttf';
const face = (word: string, css: string, regular: string, bold: string): FontFace => ({ word, css, files: { regular: FONT_DIR + regular, bold: FONT_DIR + bold } });
const calibri = face('Calibri', 'Calibri, Carlito, sans-serif', 'calibri.ttf', 'calibrib.ttf');
const georgia = face('Georgia', 'Georgia, serif', 'georgia.ttf', 'georgiab.ttf');
const garamond = face('Garamond', 'Garamond, "EB Garamond", serif', 'GARA.TTF', 'GARABD.TTF');
const palatino = face('Palatino Linotype', '"Palatino Linotype", Palatino, "Book Antiqua", serif', 'pala.ttf', 'palab.ttf');
const constantia = face('Constantia', 'Constantia, Georgia, serif', 'constan.ttf', 'constanb.ttf');
const corbel = face('Corbel', 'Corbel, Calibri, sans-serif', 'corbel.ttf', 'corbelb.ttf');
const trebuchet = face('Trebuchet MS', '"Trebuchet MS", Arial, sans-serif', 'trebuc.ttf', 'trebucbd.ttf');
const verdana = face('Verdana', 'Verdana, Arial, sans-serif', 'verdana.ttf', 'verdanab.ttf');

export const fontPairIds = ['calibri', 'georgia-calibri', 'garamond', 'palatino', 'constantia-corbel', 'trebuchet', 'georgia', 'verdana'] as const;
export type FontPairId = (typeof fontPairIds)[number];
export const fontPairs: Record<FontPairId, { name: string; description: string; heading: FontFace; body: FontFace }> = {
  calibri: { name: 'Calibri', description: "Clean and modern; Word's familiar default", heading: calibri, body: calibri },
  'georgia-calibri': { name: 'Georgia + Calibri', description: 'Warm serif headings, easy text', heading: georgia, body: calibri },
  garamond: { name: 'Garamond', description: 'Traditional and elegant', heading: garamond, body: garamond },
  palatino: { name: 'Palatino', description: 'Classic book type, very readable', heading: palatino, body: palatino },
  'constantia-corbel': { name: 'Constantia + Corbel', description: 'Soft serif headings, friendly text', heading: constantia, body: corbel },
  trebuchet: { name: 'Trebuchet', description: 'Open, slightly playful sans', heading: trebuchet, body: trebuchet },
  georgia: { name: 'Georgia', description: 'Sturdy serif throughout', heading: georgia, body: georgia },
  verdana: { name: 'Verdana', description: 'Wide and highly legible on screen', heading: verdana, body: verdana },
};

/** The PDF family name a face is registered under, e.g. "Pair-GARA". */
export const pdfFamilyName = (f: FontFace) => 'Pair-' + (f.files.regular.split('/').pop() ?? '').replace(/\.[^.]+$/, '');

export const FONT_FALLBACK_NOTICE = "A font in this pair isn't installed here, so the PDF uses the template's own fonts.";

type PdfFamily = { regular: string; bold: string };
export type ResolvedFonts = {
  pdf: { heading: PdfFamily; body: PdfFamily };
  word: { heading: string; body: string };
  /** CSS stacks for the preview; null means the template's own CSS rules apply. */
  css: { heading: string; body: string } | null;
  /** Faces the PDF must register (empty when the template fonts are used). */
  faces: FontFace[];
  fallback: boolean;
};

/** Fonts for the PDF, Word and preview. Without a pair this is exactly the template's behaviour from before. */
export function resolveFonts(layout: Pick<Layout, 'template' | 'fontPair'>, fileExists: (path: string) => boolean): ResolvedFonts {
  const theme = templates[layout.template];
  const local = fileExists(TEMPLATE_FONT_FILE);
  const templatePdf = (serif: boolean): PdfFamily => local
    ? { regular: serif ? 'StudioSerif' : 'StudioSans', bold: serif ? 'StudioSerif' : 'StudioSans' }
    : serif ? { regular: 'Times-Roman', bold: 'Times-Bold' } : { regular: 'Helvetica', bold: 'Helvetica-Bold' };
  const pdf = { heading: templatePdf(theme.display === 'serif'), body: templatePdf(theme.body === 'serif') };
  if (!layout.fontPair) {
    return { pdf, word: { heading: theme.display === 'serif' ? 'Times New Roman' : 'Calibri', body: theme.body === 'serif' ? 'Times New Roman' : 'Calibri' }, css: null, faces: [], fallback: false };
  }
  const pair = fontPairs[layout.fontPair];
  const faces = pair.heading === pair.body ? [pair.heading] : [pair.heading, pair.body];
  const word = { heading: pair.heading.word, body: pair.body.word };
  const css = { heading: pair.heading.css, body: pair.body.css };
  if (!faces.every(f => fileExists(f.files.regular) && fileExists(f.files.bold))) return { pdf, word, css, faces: [], fallback: true };
  const family = (f: FontFace): PdfFamily => ({ regular: pdfFamilyName(f), bold: pdfFamilyName(f) });
  return { pdf: { heading: family(pair.heading), body: family(pair.body) }, word, css, faces, fallback: false };
}
