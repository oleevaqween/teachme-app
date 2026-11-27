import React from 'react';
import { Document as PdfDocument, Page, Text, View, renderToBuffer, Font } from '@react-pdf/renderer';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, BorderStyle, AlignmentType, ShadingType, Table, TableRow, TableCell, WidthType, TableLayoutType } from 'docx';
import { extractText, getDocumentProxy } from 'unpdf';
import { parseOffice } from 'officeparser';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { checkResume, type Workspace, type Resume } from './schema';
import { templates, templateSpacing } from './templates';
import { repairOrder } from './sections';
import { sectionBlocks, type Block } from './blocks';
import { columnPlan } from './columns';
import { FONT_FALLBACK_NOTICE, TEMPLATE_FONT_FILE, pdfFamilyName, resolveAccent, resolveFonts, type FontFace } from './design';

export type { Block } from './blocks';
export function resumeBlocks(w: Workspace): Block[] {
  const r = w.resume;
  const header: Block[] = [
    { type: 'name', text: r.personal.fullName }, { type: 'title', text: r.personal.professionalTitle },
    { type: 'contact', text: [r.personal.email, r.personal.phone, r.personal.location, r.personal.linkedin].filter(Boolean).join(' | ') },
  ];
  const plan = columnPlan(w.layout, r);
  if (plan) {
    const main = plan.main.flatMap(key => sectionBlocks(r, key)), side = plan.side.flatMap(key => sectionBlocks(r, key));
    // A column whose sections print no text (for example only blank language rows) falls back to one column.
    if (main.length && side.length) {
      return [...header, ...main.map(b => ({ ...b, column: 'main' as const })), ...side.map(b => ({ ...b, column: 'side' as const }))].filter(b => b.text.trim());
    }
  }
  return [...header, ...repairOrder(w.layout.order, r).flatMap(key => sectionBlocks(r, key))].filter(b => b.text.trim());
}
export function exportBlocks(w: Workspace, kind: 'cv' | 'letter'): Block[] {
  if (kind === 'cv') return resumeBlocks(w);
  if (!w.package?.coverLetter.trim()) throw new Error('Generate or write a cover letter first.');
  return [
    { type: 'name', text: w.resume.personal.fullName },
    { type: 'contact', text: [w.resume.personal.email, w.resume.personal.phone, w.resume.personal.location].filter(Boolean).join(' | ') },
    ...w.package.coverLetter.split(/\n\s*\n/).map(text => ({ type: 'body' as const, text })),
  ];
}
Font.registerHyphenationCallback(word => [word]);
// The panel name is capped: a long surname at the template's full name size would run past the colour band.
const PANEL_NAME_SIZE = 18;
/** The colour band's inner padding: 26pt on the left and 18pt on the right. */
const PANEL_PADDING_LEFT = 26, PANEL_PADDING = 44;
// Narrow columns: long words (URLs, email addresses, long hyphenated words) may wrap after punctuation; ordinary words up to 20 characters stay whole.
// Each break is an empty piece, which react-pdf lays out as a zero-width gap rather than a hyphenation point, so no hyphen is added at the break.
// A run of letters too long to fit on one line of its column also gets syllable breaks (English hyphenation points, or every 6 letters
// when there are none). react-pdf fills lines greedily, so a hyphenation point is used whenever a word reaches the line end; offering
// them only for runs that cannot fit on a line keeps words that would fit whole. Addresses (with @ or /) never get a hyphen: their
// overlong runs get zero-width breaks instead. The export text check joins a word split across lines, so it still sees whole words.
/** Average letter width as a share of the font size, used to estimate how many letters fit on one line of a column. */
const AVERAGE_LETTER_WIDTH = 0.5, BOLD_LETTER_WIDTH = 0.56, CAPITAL_LETTER_WIDTH = 0.72;
const lettersPerLine = (width: number, fontSize: number, letterWidth = AVERAGE_LETTER_WIDTH) => Math.max(8, Math.floor(width / (fontSize * letterWidth)));
const sixLetterChunks = (run: string) => run.match(/(?:\P{M}\p{M}*){1,6}/gu) ?? [run];

function longWordBreaker(maxLetters: number) {
  return (word: string, hyphenate: (word: string) => string[] = w => [w]): string[] => {
    if (word.length <= Math.min(20, maxLetters)) return [word];
    const address = /[@/]/.test(word);
    const pieces = word.length > 20 ? (word.match(/[\p{L}\p{M}\p{N}([{]*[^\p{L}\p{M}\p{N}([{]*/gu) ?? []).filter(Boolean) : [word];
    if (!pieces.length) return [word];
    return pieces.flatMap((piece, i) => [...(i ? [''] : []), ...splitPiece(piece, maxLetters, address, hyphenate)]);
  };
}
/** A piece is a run of letters plus any punctuation after it; only a letters-only run longer than a line is split. */
function splitPiece(piece: string, maxLetters: number, address: boolean, hyphenate: (word: string) => string[]): string[] {
  // In an address, digits belong to the run too (nwankwo2024@...), so the whole run can still be broken without a hyphen.
  const run = piece.match(address ? /^[\p{L}\p{M}\p{N}]*/u : /^[\p{L}\p{M}]*/u)![0], tail = piece.slice(run.length);
  if (run.length <= maxLetters || (!address && /[\p{N}([{]/u.test(tail.charAt(0)))) return [piece];
  if (address) {
    const chunks = sixLetterChunks(run);
    chunks[chunks.length - 1] += tail;
    return chunks.flatMap((chunk, i) => (i ? ['', chunk] : [chunk]));
  }
  let parts = hyphenate(run).filter(Boolean);
  if (parts.length < 2 || parts.join('') !== run) parts = sixLetterChunks(run);
  parts[parts.length - 1] += tail;
  return parts;
}
const localFonts = existsSync(TEMPLATE_FONT_FILE);
if (localFonts) {
  Font.register({ family: 'StudioSans', fonts: [{ src: 'C:/Windows/Fonts/arial.ttf' }, { src: 'C:/Windows/Fonts/arialbd.ttf', fontWeight: 700 }] });
  Font.register({ family: 'StudioSerif', fonts: [{ src: 'C:/Windows/Fonts/times.ttf' }, { src: 'C:/Windows/Fonts/timesbd.ttf', fontWeight: 700 }] });
}
const registeredFaces = new Set<string>();
// Families still to prime; the template fonts are registered above.
const needsPriming = new Set<string>(localFonts ? ['StudioSans', 'StudioSerif'] : []);
const primedFamilies = new Set<string>();
/** Registers a font pair's faces once each (regular and bold) from the Windows font files. */
function registerFaces(faces: FontFace[]) {
  for (const f of faces) {
    const family = pdfFamilyName(f);
    if (registeredFaces.has(family)) continue;
    Font.register({ family, fonts: [{ src: f.files.regular }, { src: f.files.bold, fontWeight: 700 }] });
    registeredFaces.add(family);
    needsPriming.add(family);
  }
}
const PRIME_TEXT = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789 .,;:!?\'"()&-/%$£€@#*+=';
/**
 * fontkit caches each glyph with the code points of the first request that creates it, and react-pdf keeps the
 * font for the life of the process. If a face's first use is a line with an accented capital, base glyphs such as
 * "I" are cached without code points and every later PDF extracts garbage. Rendering plain text once per family
 * creates the common glyphs through the normal code-point path before any real document uses the face.
 */
async function primeFonts() {
  const pending = [...needsPriming].filter(f => !primedFamilies.has(f));
  if (!pending.length) return;
  await renderToBuffer(<PdfDocument><Page size="A4">{pending.flatMap(fontFamily => [400, 700].map(fontWeight =>
    <Text key={fontFamily + fontWeight} style={{ fontFamily, fontWeight }}>{PRIME_TEXT}</Text>))}</Page></PdfDocument>);
  for (const f of pending) primedFamilies.add(f);
}
export function CareerPdf({ workspace: w, kind = 'cv' }: { workspace: Workspace; kind?: 'cv' | 'letter' }) {
  const accent = resolveAccent(w.layout), color = accent.hex, theme = templates[w.layout.template], spacing = templateSpacing(w.layout.template);
  const fonts = resolveFonts(w.layout, existsSync);
  registerFaces(fonts.faces);
  const base = resolveFonts({ template: w.layout.template }, existsSync);
  // Characters a pair's font lacks (for example the Naira sign) fall back to the template font.
  const fontFor = (role: 'heading' | 'body', bold = false) => {
    const name = bold ? fonts.pdf[role].bold : fonts.pdf[role].regular;
    if (!fonts.faces.length) return name;
    return [name, bold ? base.pdf[role].bold : base.pdf[role].regular];
  };
  const font = fontFor('body');
  const blocks = exportBlocks(w, kind), isHeader = (b: Block) => ['name', 'title', 'contact'].includes(b.type);
  const mainBlocks = blocks.filter(b => b.column === 'main'), sideBlocks = blocks.filter(b => b.column === 'side');
  const centered = theme.header === 'centered' || theme.header === 'signature';
  const pageWidth = w.layout.pageSize === 'A4' ? 595.28 : 612;
  const bandWidth = Math.round(pageWidth * 0.34);
  // The side column is 32% of the text width (page width less 44pt margins on each side).
  const sideWidth = (pageWidth - 88) * 0.32;
  const renderOn = (onPanel: boolean) => function renderOne(b: Block, i: number) {
    const display = b.type === 'name' || b.type === 'heading';
    const bold = b.type === 'entry' || (display && w.layout.template !== 'editorial');
    const inHeader = isHeader(b);
    // Pair fonts such as Georgia lack letters like ọ/ẹ/ṣ but have the tone marks, which would split a run across fonts; use the template font whole.
    const fontSize = b.type === 'name' ? (onPanel ? Math.min(theme.nameSize, PANEL_NAME_SIZE) : theme.nameSize) : b.type === 'title' ? 12 : b.type === 'heading' ? theme.headingSize : b.type === 'contact' || b.type === 'meta' ? w.layout.fontSize - 1 : w.layout.fontSize;
    // Narrow columns get a word breaker sized to how many letters fit on one of their lines; one-column and main-column text is untouched.
    const narrowWidth = onPanel ? bandWidth - PANEL_PADDING : b.column === 'side' ? sideWidth : 0;
    // Capitals and bold letters are wider, and shaded or ruled headings lose their padding from the line.
    const letterWidth = b.type === 'heading' && theme.uppercase ? CAPITAL_LETTER_WIDTH : bold ? BOLD_LETTER_WIDTH : AVERAGE_LETTER_WIDTH;
    const inset = b.type === 'bullet' ? 18 : b.type === 'heading' && !onPanel ? (theme.section === 'shaded' ? 18 : theme.section === 'rail' ? 12 : 0) : 0;
    const breakWords = narrowWidth ? longWordBreaker(lettersPerLine(narrowWidth - inset, fontSize, letterWidth)) : undefined;
    const fontFamily = /\p{M}/u.test(b.text) ? (bold ? base.pdf[display ? 'heading' : 'body'].bold : base.pdf[display ? 'heading' : 'body'].regular) : fontFor(display ? 'heading' : 'body', bold);
    return <View key={i} minPresenceAhead={['heading', 'entry'].includes(b.type) ? 32 : 0} style={{
      marginTop: b.type === 'heading' ? spacing.section : b.type === 'entry' ? spacing.entry : 0,
      marginBottom: b.type === 'name' ? 3 : b.type === 'heading' ? 7 : b.type === 'body' ? spacing.body : 3,
      ...(b.type === 'name' && theme.header === 'top-rule' && !onPanel ? { borderTopWidth: 4, borderTopColor: color, paddingTop: 13 } : {}),
      ...(b.type === 'heading' && onPanel ? { borderBottomWidth: 0.6, borderBottomColor: '#ffffff', paddingBottom: 3 } : {}),
      ...(b.type === 'heading' && !onPanel && theme.section === 'underline' ? { borderBottomWidth: 0.6, borderBottomColor: color, paddingBottom: 3 } : {}),
      ...(b.type === 'heading' && !onPanel && theme.section === 'shaded' ? { backgroundColor: accent.tint, paddingVertical: 5, paddingHorizontal: 9 } : {}),
      ...(b.type === 'heading' && !onPanel && theme.section === 'rail' ? { borderLeftWidth: 2, borderLeftColor: color, paddingLeft: 10, paddingVertical: 2 } : {}),
    }}><Text hyphenationCallback={breakWords} style={{
      lineHeight: spacing.line,
      fontFamily, fontWeight: bold ? 700 : 400,
      fontSize,
      color: onPanel || (theme.header === 'banner' && inHeader) ? '#ffffff' : ['name', 'heading', 'title'].includes(b.type) ? color : ['contact', 'meta'].includes(b.type) ? '#52606b' : '#252e35',
      ...(b.type === 'bullet' ? { paddingLeft: 10 } : {}),
      ...(!onPanel && ((centered && inHeader) || (b.type === 'heading' && theme.section === 'centered')) ? { textAlign: 'center' as const } : {}),
      ...(b.type === 'heading' && theme.uppercase ? { textTransform: 'uppercase' as const } : {}),
    }}>{b.type === 'bullet' ? '• ' : ''}{b.text}</Text></View>;
  };
  const renderBlock = renderOn(false), renderPanelBlock = renderOn(true);
  const panel = sideBlocks.length > 0 && w.layout.columns === 'panel';
  return <PdfDocument title={w.name} author={w.resume.personal.fullName}>
    <Page size={w.layout.pageSize} style={{ paddingTop: 42, paddingBottom: 40, paddingHorizontal: 44, ...(panel ? { paddingLeft: 0 } : {}), fontFamily: font, fontSize: w.layout.fontSize, lineHeight: spacing.line, color: '#252e35' }}>
      {panel ? <>
        {/* A fixed band repeats on every page; absolute positions are measured from the page edge, so it runs the full height. */}
        <View fixed style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: bandWidth, backgroundColor: color }} />
        <View style={{ flexDirection: 'row' }}>
          {/* The band column comes first in the tree so the name is read first. */}
          <View style={{ width: bandWidth, paddingLeft: PANEL_PADDING_LEFT, paddingRight: PANEL_PADDING - PANEL_PADDING_LEFT }}>{blocks.filter(b => isHeader(b) || b.column === 'side').map(renderPanelBlock)}</View>
          <View style={{ flexGrow: 1, flexBasis: 0, paddingLeft: 24 }}>{mainBlocks.map(renderBlock)}</View>
        </View>
      </> : <>
      <View wrap={false} style={{
        ...(theme.header === 'banner' ? { backgroundColor: color, padding: 16, marginBottom: 8 } : {}),
        ...(theme.header === 'rail' ? { borderLeftWidth: 4, borderLeftColor: color, paddingLeft: 15, marginBottom: 8 } : {}),
      }}>{blocks.filter(isHeader).map(renderBlock)}
        {theme.header === 'signature' && <View style={{ height: 4, borderTopWidth: 0.5, borderBottomWidth: 0.5, borderColor: color, marginTop: 9, marginBottom: 4 }} />}
      </View>
      {sideBlocks.length ? <View style={{ flexDirection: w.layout.columns === 'right' ? 'row' : 'row-reverse', justifyContent: 'space-between' }}>
        {/* The main column comes first in the tree for both sides, so PDF text reads experience before skills. */}
        <View style={{ width: '64.5%' }}>{mainBlocks.map(renderBlock)}</View>
        <View style={{ width: '32%' }}>{sideBlocks.map(renderBlock)}</View>
      </View> : blocks.filter(b => !isHeader(b)).map(renderBlock)}
      </>}
    </Page>
  </PdfDocument>;
}
export function verifyExtractedText(blocks: Block[], extracted: string, resume: Resume) {
  const tokens = (s: string) => s.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const expected = tokens(blocks.map(b => b.text).join(' '));
  const actual = tokens(extracted);
  // Ordered token subsequence: detect reordered columns as well as lost text.
  // A long word hyphenated across lines arrives as consecutive pieces ("pneumonoultramicro", "scopic..."), so pieces that join into the expected word count as that word.
  const matchesInOrder = (want: string[]) => {
    let index = 0, partial = '';
    for (const token of actual) {
      if (index === want.length) break;
      const target = want[index];
      if (partial) {
        const joined = partial + token;
        if (joined === target) { index++; partial = ''; continue; }
        if (target.startsWith(joined)) { partial = joined; continue; }
        partial = '';
      }
      if (token === target) index++;
      else if (token.length < target.length && target.startsWith(token)) partial = token;
    }
    return index === want.length;
  };
  const inOrder = (group: Block[]) => matchesInOrder(tokens(group.map(b => b.text).join(' ')));
  // Two-column PDFs are read page by page (page 1 main, page 1 side, page 2 main), so the header and each column are checked in their own order.
  const groups = blocks.some(b => b.column) ? [blocks.filter(b => !b.column), blocks.filter(b => b.column === 'main'), blocks.filter(b => b.column === 'side')] : [blocks];
  if (!groups.every(inOrder)) throw new Error('Export verification found missing or reordered text. Try another template or remove unsupported characters.');
  for (const symbol of ['₦', '$', '€', '£', '%']) {
    const count = (s: string) => s.split(symbol).length - 1;
    if (count(extracted) < count(blocks.map(b => b.text).join(' '))) throw new Error('Export verification found a missing currency or percentage symbol.');
  }
  // A long email may wrap in a narrow column with a line-break hyphen added after punctuation; accept the text with or without those hyphens.
  const flat = extracted.replace(/\s+/g, ''), unbroken = extracted.replace(/-\s+/g, '').replace(/\s+/g, '');
  if (resume.personal.email && ![flat, unbroken].some(t => t.includes(resume.personal.email.replace(/\s+/g, '')))) throw new Error('The exported email address could not be verified.');
  for (const value of [resume.personal.fullName, resume.personal.email, resume.personal.phone].filter(Boolean)) {
    const needle = tokens(value).join(' ');
    // A long name or email in the narrow panel may wrap mid-word, so their pieces may arrive split but must still appear in order
    // (the email is also matched character for character above); the phone number must appear exactly.
    if (!actual.join(' ').includes(needle) && !(value !== resume.personal.phone && matchesInOrder(tokens(value)))) throw new Error('The exported contact details could not be verified.');
  }
  return { textVerified: true, tokens: expected.length, scope: 'Text extraction and order checked; not a guarantee for every employer ATS.' };
}
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
/** Word two-column body: an invisible one-row table. Word reads cells in order, so the side cell comes first for the left style. */
function columnsTable(main: Paragraph[], side: Paragraph[], sideFirst: boolean, width: number, sideFill?: string) {
  const mainWidth = Math.round(width * 0.66), sideWidth = width - mainWidth, gap = 360;
  // With a panel, the main cell gets the same top and bottom margins as the side cell so both columns start at the same height.
  const mainCell = new TableCell({ children: main, width: { size: mainWidth, type: WidthType.DXA }, margins: { ...(sideFill ? { top: 240, bottom: 240 } : {}), ...(sideFirst ? { left: gap } : { right: gap }) } });
  const sideCell = new TableCell({ children: side, width: { size: sideWidth, type: WidthType.DXA },
    // The panel cell is shaded and padded on all sides; Word shades the whole cell, which is as tall as the table row, so the colour runs to the bottom of the taller column.
    ...(sideFill ? { shading: { type: ShadingType.CLEAR, fill: sideFill }, margins: { top: 240, bottom: 240, left: 240, right: 240 } } : { margins: sideFirst ? { right: gap } : { left: gap } }) });
  return new Table({
    rows: [new TableRow({ children: sideFirst ? [sideCell, mainCell] : [mainCell, sideCell] })],
    width: { size: width, type: WidthType.DXA }, columnWidths: sideFirst ? [sideWidth, mainWidth] : [mainWidth, sideWidth],
    layout: TableLayoutType.FIXED,
    borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
  });
}

export async function exportDocument(w: Workspace, format: 'pdf'|'docx'|'txt', kind: 'cv'|'letter' = 'cv') {
  const errors = checkResume(w.resume).filter(f => f.severity === 'error');
  if (errors.length) throw new Error(errors[0].title);
  const blocks = exportBlocks(w, kind);
  let buffer: Buffer, extracted: string, pages: number | null = null;
  if (format === 'pdf') {
    // CareerPdf registers the pair's faces while rendering; register first so priming covers them.
    registerFaces(resolveFonts(w.layout, existsSync).faces);
    await primeFonts();
    buffer = await renderToBuffer(<CareerPdf workspace={w} kind={kind} />);
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    try {
      const result = await extractText(pdf, { mergePages: true });
      extracted = result.text; pages = result.totalPages;
    } finally { await pdf.destroy(); }
  } else if (format === 'docx') {
    const accent = resolveAccent(w.layout), color = accent.hex.slice(1), size = w.layout.fontSize * 2;
    const fonts = resolveFonts(w.layout, existsSync);
    const theme = templates[w.layout.template], spacing = templateSpacing(w.layout.template);
    const paragraph = (b: Block, onPanel = false) => {
      const header = ['name', 'title', 'contact'].includes(b.type), display = ['name', 'heading'].includes(b.type);
      const banner = !onPanel && header && theme.header === 'banner';
      return new Paragraph({
      heading: b.type === 'heading' ? HeadingLevel.HEADING_1 : undefined,
      keepNext: ['heading','entry','name','title'].includes(b.type),
      alignment: !onPanel && ((header && ['centered', 'signature'].includes(theme.header)) || (b.type === 'heading' && theme.section === 'centered')) ? AlignmentType.CENTER : AlignmentType.LEFT,
      spacing: { before: b.type === 'heading' ? spacing.section * 20 : b.type === 'entry' ? spacing.entry * 20 : banner && b.type === 'name' ? 160 : 0, after: banner ? (b.type === 'contact' ? 160 : 0) : b.type === 'body' ? spacing.body * 20 : 60, line: Math.round(spacing.line * 240) },
      bullet: b.type === 'bullet' ? { level: 0 } : undefined,
      // Word draws the bullet symbol in the paragraph mark's colour, so the panel's paragraph mark is white like its text.
      ...(onPanel ? { run: { color: 'FFFFFF' } } : {}),
      ...(banner || (!onPanel && b.type === 'heading' && theme.section === 'shaded') ? { shading: { type: ShadingType.CLEAR, fill: banner ? color : accent.tint.slice(1).toUpperCase() } } : {}),
      border: onPanel ? (b.type === 'heading' ? { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'FFFFFF', space: 3 } } : {}) : {
        ...(b.type === 'name' && theme.header === 'top-rule' ? { top: { style: BorderStyle.SINGLE, size: 24, color, space: 8 } } : {}),
        ...(b.type === 'contact' && theme.header === 'signature' ? { bottom: { style: BorderStyle.DOUBLE, size: 6, color, space: 8 } } : {}),
        ...(b.type === 'heading' && theme.section === 'underline' ? { bottom: { style: BorderStyle.SINGLE, size: 4, color, space: 3 } } : {}),
        ...((header && theme.header === 'rail') || (b.type === 'heading' && theme.section === 'rail') ? { left: { style: BorderStyle.SINGLE, size: 18, color, space: 8 } } : {}),
      },
      children: [new TextRun({
        text: b.type === 'heading' && theme.uppercase ? b.text.toUpperCase() : b.text,
        font: display ? fonts.word.heading : fonts.word.body,
        size: b.type === 'name' ? (onPanel ? Math.min(theme.nameSize, PANEL_NAME_SIZE) : theme.nameSize) * 2 : b.type === 'heading' ? theme.headingSize * 2 : size,
        bold: b.type === 'entry' || (display && w.layout.template !== 'editorial'),
        color: onPanel || banner ? 'FFFFFF' : ['name','heading','title'].includes(b.type) ? color : '252E35',
      })],
    }); };
    const page = w.layout.pageSize === 'A4' ? { width: 11906, height: 16838 } : { width: 12240, height: 15840 };
    const sideBlocks = blocks.filter(b => b.column === 'side'), mainParagraphs = () => blocks.filter(b => b.column === 'main').map(b => paragraph(b));
    const contentWidth = page.width - 880 * 2;
    const children = !sideBlocks.length ? blocks.map(b => paragraph(b))
      : w.layout.columns === 'panel'
        ? [columnsTable(mainParagraphs(), blocks.filter(b => !b.column || b.column === 'side').map(b => paragraph(b, true)), true, contentWidth, color.toUpperCase())]
        : [...blocks.filter(b => !b.column).map(b => paragraph(b)), columnsTable(mainParagraphs(), sideBlocks.map(b => paragraph(b)), w.layout.columns !== 'right', contentWidth)];
    buffer = await Packer.toBuffer(new Document({ sections: [{
      properties: { page: {
        size: page,
        margin: { top: 840, bottom: 800, left: 880, right: 880 },
      } }, children,
    }] }));
    extracted = (await parseOffice(buffer, { fileType: 'docx' })).toText();
  } else {
    extracted = blocks.map(b => (b.type === 'bullet' ? '- ' : '') + b.text).join('\n');
    buffer = Buffer.from(extracted, 'utf8');
  }
  const verification = verifyExtractedText(blocks, extracted, w.resume);
  const fontFallback = format === 'pdf' && resolveFonts(w.layout, existsSync).fallback;
  return { buffer, verification: { ...verification, pages, sha256: createHash('sha256').update(buffer).digest('hex'), ...(fontFallback ? { fontNotice: FONT_FALLBACK_NOTICE } : {}) } };
}
