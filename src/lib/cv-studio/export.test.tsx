import { describe, it, expect } from 'vitest';
import { fixture } from './test-fixture';
import { exportDocument, resumeBlocks, verifyExtractedText } from './export';
import { templateIds } from './templates';
import { LayoutSchema, WorkspaceSchema } from './schema';
import { extraSectionKeys, sectionKeys } from './sections';
import { getDocumentProxy, extractText } from 'unpdf';
import { parseOffice } from 'officeparser';
import { fontPairIds } from './design';
import JSZip from 'jszip';
describe('Actual exported document verification', () => {
  it('rejects lost and reordered content', () => {
    const w = fixture(), blocks = resumeBlocks(w);
    expect(() => verifyExtractedText(blocks, 'Ada Okoro', w.resume)).toThrow();
    expect(() => verifyExtractedText(blocks, [...blocks].reverse().map(b => b.text).join('\n'), w.resume)).toThrow();
  });
  it('rejects a lost currency symbol or email punctuation', () => {
    const w = fixture(), blocks = resumeBlocks(w), full = blocks.map(b => b.text).join('\n');
    expect(() => verifyExtractedText(blocks, full.replace('₦', ''), w.resume)).toThrow('symbol');
    expect(() => verifyExtractedText(blocks, full.replace('@', ' '), w.resume)).toThrow('email');
  });
  for (const template of templateIds) {
    it('verifies the ' + template + ' PDF and Word template without changing CV facts', async () => {
      const w = fixture(); w.layout.template = template;
      const before = structuredClone(w);
      expect(LayoutSchema.parse(w.layout).template).toBe(template);
      const pdf = await exportDocument(w, 'pdf');
      expect(pdf.verification.pages).toBe(1);
      expect(pdf.verification.textVerified).toBe(true);
      expect((await exportDocument(w, 'docx')).verification.textVerified).toBe(true);
      expect(w).toEqual(before);
    }, 30000);
  }
  for (const format of ['pdf', 'docx', 'txt'] as const) {
    it('round-trips real ' + format + ' bytes including Nigerian currency and contact details', async () => {
      const result = await exportDocument(fixture(), format);
      expect(result.buffer.length).toBeGreaterThan(100);
      expect(result.verification.textVerified).toBe(true);
      expect(result.verification.sha256).toHaveLength(64);
    }, 30000);
  }
  it.each(templateIds)('paginates long %s CVs while preserving all content in order', async template => {
    const w = fixture();
    w.layout.template = template;
    w.resume.experience = Array.from({ length: 12 }, (_, i) => ({ ...w.resume.experience[0], id: 'e' + i, achievements: Array.from({ length: 9 }, (_, j) => 'Delivered project ' + i + ' workstream ' + j + ' with documented stakeholder review and budget reporting.').join('\n') }));
    const result = await exportDocument(w, 'pdf');
    expect(result.verification.pages).toBeGreaterThan(1);
    expect(result.verification.textVerified).toBe(true);
  }, 30000);
  it.each(templateIds)('exports a %s cover letter with long contact details', async template => {
    const w = fixture(); w.layout.template = template; w.layout.pageSize = 'LETTER';
    w.resume.personal.fullName = 'Ada Okoro, Project and Programme Management';
    w.resume.personal.linkedin = 'https://www.linkedin.com/in/example-professional-profile';
    w.package = { coverLetter: 'Dear Hiring Team,\n\nI managed a budget of ₦2,000,000 and prepared monthly reports for 4 stakeholders.\n\nKind regards,\nAda Okoro', coverLetterApproved: true, interview: [], learningPriorities: [] };
    expect((await exportDocument(w, 'pdf', 'letter')).verification.textVerified).toBe(true);
    expect((await exportDocument(w, 'docx', 'letter')).verification.textVerified).toBe(true);
  }, 30000);
  for (const pair of fontPairIds) {
    it('exports the ' + pair + ' font pair to PDF and Word with verified text', async () => {
      const w = fixture(); w.layout.fontPair = pair;
      const pdf = await exportDocument(w, 'pdf');
      expect(pdf.verification.textVerified).toBe(true);
      expect(pdf.verification.fontNotice).toBeUndefined();
      expect((await exportDocument(w, 'docx')).verification.textVerified).toBe(true);
    }, 30000);
  }
  for (const pair of ['georgia', 'garamond', 'palatino', 'constantia-corbel', 'trebuchet'] as const) {
    it('keeps the Naira sign in headings and body with the ' + pair + ' pair', async () => {
      const w = fixture(); w.layout.fontPair = pair;
      w.resume.personal.professionalTitle = 'Budgets from ₦2,000,000';
      const pdf = await exportDocument(w, 'pdf');
      expect(pdf.verification.textVerified).toBe(true);
      expect(pdf.verification.fontNotice).toBeUndefined();
    }, 30000);
  }
  it('exports new and custom colours on the banner and shaded templates', async () => {
    const burgundy = fixture(); burgundy.layout.template = 'studio'; burgundy.layout.accent = 'burgundy';
    const custom = fixture(); custom.layout.template = 'precision'; custom.layout.accent = 'custom'; custom.layout.customAccent = '#c2410c';
    const junk = fixture(); junk.layout.accent = 'custom'; junk.layout.customAccent = 'junk';
    for (const w of [burgundy, custom, junk]) {
      expect((await exportDocument(w, 'pdf')).verification.textVerified).toBe(true);
      expect((await exportDocument(w, 'docx')).verification.textVerified).toBe(true);
    }
  }, 60000);
});

describe('tone-marked Yoruba letters in Georgia pairs', () => {
  it('exports a Georgia pair CV with a tone-marked company', async () => {
    const w = fixture(); w.layout.fontPair = 'georgia';
    w.resume.experience[0].company = 'Ọ̀yọ́ Holdings';
    expect((await exportDocument(w, 'pdf')).verification.textVerified).toBe(true);
  }, 30000);
  it('exports a Georgia + Calibri CV with a tone-marked name', async () => {
    const w = fixture(); w.layout.fontPair = 'georgia-calibri';
    w.resume.personal.fullName = 'Adé Ọ̀yọ́';
    expect((await exportDocument(w, 'pdf')).verification.textVerified).toBe(true);
  }, 30000);
});

describe('extra sections on the exported CV', () => {
  it('prints an old CV exactly as before', () => {
    const body = JSON.parse(JSON.stringify(fixture()));
    for (const key of extraSectionKeys) delete body.resume[key];
    const before = resumeBlocks(fixture());
    expect(resumeBlocks(WorkspaceSchema.parse(body))).toEqual(before);
    expect(before.map(b => b.text)).not.toContain('Volunteering');
  });

  it('prints volunteering like experience, languages one per line and text sections line by line', () => {
    const w = fixture();
    w.resume.volunteering = [{ id: 'v1', role: 'Mentor', organisation: 'Code Club', location: 'Lagos', startDate: '2021', endDate: '2022', achievements: '• Mentored 8 students\nRan weekly sessions' }];
    w.resume.languages = [{ id: 'l1', language: 'French', level: 'Professional working' }, { id: 'l2', language: 'Yoruba', level: '' }, { id: 'l3', language: ' ', level: '' }];
    w.resume.awards = 'Employee of the year 2023\n\nTop mentor 2022';
    w.layout.order = [...w.layout.order, 'volunteering', 'languages', 'awards'];
    const blocks = resumeBlocks(w);
    const from = (heading: string) => blocks.slice(blocks.findIndex(b => b.type === 'heading' && b.text === heading) + 1);
    expect(from('Volunteering').slice(0, 4)).toEqual([
      { type: 'entry', text: 'Mentor | Code Club' }, { type: 'meta', text: 'Lagos | 2021 - 2022' },
      { type: 'bullet', text: 'Mentored 8 students' }, { type: 'bullet', text: 'Ran weekly sessions' },
    ]);
    expect(from('Languages').slice(0, 2)).toEqual([{ type: 'body', text: 'French: Professional working' }, { type: 'body', text: 'Yoruba' }]);
    expect(from('Awards & achievements')).toEqual([{ type: 'body', text: 'Employee of the year 2023' }, { type: 'body', text: 'Top mentor 2022' }]);
  });

  it('prints a section with content even when the order leaves it out', () => {
    const w = fixture();
    w.resume.references = 'Available on request';
    expect(resumeBlocks(w).map(b => b.text)).toContain('References');
  });
});

describe('two-column blocks and the per-column check', () => {
  const twoColumn = () => { const w = fixture(); w.layout.columns = 'right'; return w; };
  const text = (blocks: { text: string }[]) => blocks.map(b => b.text).join('\n');

  it('prints a one-column CV with no column tags', () => {
    expect(resumeBlocks(fixture()).some(b => 'column' in b)).toBe(false);
  });

  it('orders two-column blocks header, main, then side, with the same text', () => {
    const blocks = resumeBlocks(twoColumn());
    expect(blocks.slice(0, 3).map(b => b.column)).toEqual([undefined, undefined, undefined]);
    expect(blocks.filter(b => b.type === 'heading').map(b => [b.text, b.column])).toEqual([['Profile', 'main'], ['Experience', 'main'], ['Education', 'side'], ['Skills', 'side']]);
    expect(blocks.map(b => b.text).sort()).toEqual(resumeBlocks(fixture()).map(b => b.text).sort());
  });

  it('falls back to one column when a column would be empty', () => {
    const w = twoColumn(); w.layout.sideSections = [];
    expect(resumeBlocks(w)).toEqual(resumeBlocks(fixture()));
  });

  it('accepts page-by-page text and rejects lost or reordered text inside a column', () => {
    const w = twoColumn(), blocks = resumeBlocks(w);
    const header = blocks.filter(b => !b.column), main = blocks.filter(b => b.column === 'main'), side = blocks.filter(b => b.column === 'side');
    const pageByPage = [text(header), text(main.slice(0, 3)), text(side), text(main.slice(3))].join('\n');
    expect(verifyExtractedText(blocks, pageByPage, w.resume).textVerified).toBe(true);
    expect(() => verifyExtractedText(blocks, [text(header), text(main), text([...side].reverse())].join('\n'), w.resume)).toThrow('reordered');
    expect(() => verifyExtractedText(blocks, [text(header), text(main.slice(1)), text(side)].join('\n'), w.resume)).toThrow('reordered');
  });
});

/** The x position (points from the left page edge) of the first PDF text item containing `needle`. */
async function xOf(buffer: Buffer, needle: string, page = 1) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  try {
    const items = (await (await pdf.getPage(page)).getTextContent()).items as { str: string; transform: number[] }[];
    const item = items.find(i => i.str.includes(needle));
    if (!item) throw new Error('Text not found on page ' + page + ': ' + needle);
    return item.transform[4];
  } finally { await pdf.destroy(); }
}
async function pdfText(buffer: Buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  try { return (await extractText(pdf, { mergePages: true })).text; } finally { await pdf.destroy(); }
}
const wordText = async (buffer: Buffer) => (await parseOffice(buffer, { fileType: 'docx' })).toText();
/** Every page-1 PDF text item with its left x position and width in points. */
async function pageItems(buffer: Buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  try {
    const items = (await (await pdf.getPage(1)).getTextContent()).items as { str: string; transform: number[]; width: number }[];
    return items.filter(i => i.str.trim()).map(i => ({ str: i.str, x: i.transform[4], width: i.width }));
  } finally { await pdf.destroy(); }
}
const longExperience = (w: ReturnType<typeof fixture>) => {
  w.resume.experience = Array.from({ length: 12 }, (_, i) => ({ ...w.resume.experience[0], id: 'e' + i, achievements: Array.from({ length: 9 }, (_, j) => 'Delivered project ' + i + ' workstream ' + j + ' with documented stakeholder review and budget reporting.').join('\n') }));
};

describe('two-column exports', () => {
  it.each([['right', 'executive'], ['left', 'studio'], ['right', 'precision'], ['left', 'meridian']] as const)('exports a %s side column on %s to verified PDF, Word and Text', async (columns, template) => {
    const w = fixture(); w.layout.columns = columns; w.layout.template = template;
    const pdf = await exportDocument(w, 'pdf');
    expect(pdf.verification.textVerified).toBe(true);
    expect(pdf.verification.pages).toBe(1);
    expect((await exportDocument(w, 'docx')).verification.textVerified).toBe(true);
    expect((await exportDocument(w, 'txt')).verification.textVerified).toBe(true);
  }, 30000);

  it('places the side column beside the main column in the PDF', async () => {
    const w = fixture(); w.layout.columns = 'right';
    const right = (await exportDocument(w, 'pdf')).buffer;
    expect(await xOf(right, 'Reporting')).toBeGreaterThan(330);
    expect(await xOf(right, 'Managed a budget')).toBeLessThan(100);
    w.layout.columns = 'left';
    const left = (await exportDocument(w, 'pdf')).buffer;
    expect(await xOf(left, 'Reporting')).toBeLessThan(100);
    expect(await xOf(left, 'Managed a budget')).toBeGreaterThan(180);
    // The main column stays first in the PDF text for the left style.
    const text = await pdfText(left);
    expect(text.indexOf('Managed a budget')).toBeLessThan(text.indexOf('Reporting'));
  }, 30000);

  it('builds the Word columns as table cells, side cell first for the left style', async () => {
    const w = fixture(); w.layout.columns = 'right';
    const right = await wordText((await exportDocument(w, 'docx')).buffer);
    expect(right.indexOf('Managed a budget')).toBeLessThan(right.indexOf('Reporting'));
    w.layout.columns = 'left';
    const left = await wordText((await exportDocument(w, 'docx')).buffer);
    expect(left.indexOf('Reporting')).toBeLessThan(left.indexOf('Managed a budget'));
  }, 30000);

  it('carries a long main column onto later pages with each column in order', async () => {
    const w = fixture(); w.layout.columns = 'left'; longExperience(w);
    w.resume.certifications = 'PRINCE2 Practitioner\nPMP';
    const pdf = await exportDocument(w, 'pdf');
    expect(pdf.verification.pages).toBeGreaterThan(1);
    expect(pdf.verification.textVerified).toBe(true);
    expect(await xOf(pdf.buffer, 'Delivered project 11 workstream 8', pdf.verification.pages ?? 1)).toBeGreaterThan(180);
    expect((await exportDocument(w, 'docx')).verification.textVerified).toBe(true);
  }, 30000);

  it('keeps the Naira sign and Yoruba tone marks in the side column', async () => {
    const w = fixture(); w.layout.columns = 'right'; w.layout.fontPair = 'georgia';
    w.resume.skills = 'Budgeting in ₦\nỌ̀yọ́ community outreach';
    expect((await exportDocument(w, 'pdf')).verification.textVerified).toBe(true);
    expect((await exportDocument(w, 'docx')).verification.textVerified).toBe(true);
  }, 30000);

  it('exports a CV with every section in the side column as one column', async () => {
    const w = fixture(); w.layout.columns = 'right'; w.layout.sideSections = [...sectionKeys];
    expect(resumeBlocks(w).some(b => b.column)).toBe(false);
    const pdf = await exportDocument(w, 'pdf');
    expect(pdf.verification.textVerified).toBe(true);
    expect(await xOf(pdf.buffer, 'Reporting')).toBeLessThan(100);
  }, 30000);
});

describe('coloured side panel', () => {
  it.each(['precision', 'studio', 'classic', 'signature'] as const)('exports a %s panel CV with the name read first and verified text', async template => {
    const w = fixture(); w.layout.columns = 'panel'; w.layout.template = template;
    const pdf = await exportDocument(w, 'pdf');
    expect(pdf.verification.textVerified).toBe(true);
    expect(pdf.verification.pages).toBe(1);
    expect(await xOf(pdf.buffer, 'Ada Okoro')).toBeLessThan(60);
    expect(await xOf(pdf.buffer, 'Reporting')).toBeLessThan(60);
    expect(await xOf(pdf.buffer, 'Managed a budget')).toBeGreaterThan(200);
    expect((await pdfText(pdf.buffer)).trimStart().startsWith('Ada Okoro')).toBe(true);
    const docx = await exportDocument(w, 'docx');
    expect(docx.verification.textVerified).toBe(true);
    expect((await wordText(docx.buffer)).trimStart().startsWith('Ada Okoro')).toBe(true);
  }, 30000);

  it('keeps the main column beside the band on later pages', async () => {
    const w = fixture(); w.layout.columns = 'panel'; w.layout.pageSize = 'LETTER'; longExperience(w);
    const pdf = await exportDocument(w, 'pdf');
    expect(pdf.verification.pages).toBeGreaterThan(1);
    expect(pdf.verification.textVerified).toBe(true);
    expect(await xOf(pdf.buffer, 'Delivered project 11 workstream 8', pdf.verification.pages ?? 1)).toBeGreaterThan(200);
    expect((await exportDocument(w, 'docx')).verification.textVerified).toBe(true);
  }, 30000);

  it('exports a custom colour panel with the Naira sign and tone marks', async () => {
    const w = fixture(); w.layout.columns = 'panel'; w.layout.accent = 'custom'; w.layout.customAccent = '#c2410c';
    w.resume.skills = 'Budgeting in ₦\nỌ̀yọ́ community outreach';
    expect((await exportDocument(w, 'pdf')).verification.textVerified).toBe(true);
    expect((await exportDocument(w, 'docx')).verification.textVerified).toBe(true);
  }, 30000);
});

describe('long words in narrow columns', () => {
  it('wraps a long URL inside the right margin of a side column', async () => {
    const w = fixture(); w.layout.columns = 'right';
    w.resume.skills = 'Stakeholder management\nhttps://github.com/adaezenwankwo/portfolio-projects-2026';
    const pdf = await exportDocument(w, 'pdf');
    expect(pdf.verification.textVerified).toBe(true);
    const items = (await pageItems(pdf.buffer)).filter(i => i.x > 330);
    expect(items.length).toBeGreaterThan(0);
    const worst = Math.max(...items.map(i => i.x + i.width));
    expect(worst).toBeLessThanOrEqual(595.28 - 44 + 1);
    expect((await exportDocument(w, 'docx')).verification.textVerified).toBe(true);
  }, 30000);

  it('wraps a long link and email inside the colour band of a panel', async () => {
    const w = fixture(); w.layout.columns = 'panel';
    w.resume.personal.linkedin = 'https://www.linkedin.com/in/adaeze-nwankwo-pmp-12345678/';
    w.resume.personal.email = 'adaeze.nwankwo.projectmanagement@gmail.com';
    const pdf = await exportDocument(w, 'pdf');
    expect(pdf.verification.textVerified).toBe(true);
    const band = Math.round(595.28 * 0.34);
    const items = (await pageItems(pdf.buffer)).filter(i => i.x < band);
    expect(items.length).toBeGreaterThan(0);
    const worst = Math.max(...items.map(i => i.x + i.width));
    expect(worst).toBeLessThanOrEqual(band + 1);
    expect((await exportDocument(w, 'docx')).verification.textVerified).toBe(true);
  }, 30000);

  it('keeps a long panel name inside the colour band at the largest name size', async () => {
    const w = fixture(); w.layout.columns = 'panel'; w.layout.template = 'minimal';
    w.resume.personal.fullName = 'Oluwaseyifunmi Nwankwo-Smith';
    const pdf = await exportDocument(w, 'pdf');
    expect(pdf.verification.textVerified).toBe(true);
    const band = Math.round(595.28 * 0.34);
    const items = (await pageItems(pdf.buffer)).filter(i => i.x < band);
    expect(items.length).toBeGreaterThan(0);
    const worst = Math.max(...items.map(i => i.x + i.width));
    expect(worst).toBeLessThanOrEqual(band + 1);
  }, 30000);

  it('accepts an email split by a line-break hyphen but not an altered one', () => {
    const w = fixture(); w.layout.columns = 'right'; w.resume.personal.email = 'adaeze.nwankwo@example.com';
    const blocks = resumeBlocks(w);
    const body = (email: string) => blocks.map(b => b.text.replace('adaeze.nwankwo@example.com', email)).join('\n');
    expect(verifyExtractedText(blocks, body('adaeze.-\nnwankwo@example.com'), w.resume).textVerified).toBe(true);
    expect(() => verifyExtractedText(blocks, body('adaeze nwankwo@example.com'), w.resume)).toThrow('email');
    expect(() => verifyExtractedText(blocks, body('adaeze-\nnwankwo@example.com'), w.resume)).toThrow('email');
  });

  it.each(['right', 'panel'] as const)('wraps a long hyphenated word inside a %s column without adding or doubling hyphens', async columns => {
    const w = fixture(); w.layout.columns = columns;
    const word = 'end-to-end-programme-delivery-and-stakeholder-engagement-leadership';
    w.resume.skills = 'Stakeholder management\n' + word;
    const pdf = await exportDocument(w, 'pdf');
    expect(pdf.verification.textVerified).toBe(true);
    const items = await pageItems(pdf.buffer);
    if (columns === 'right') {
      const side = items.filter(i => i.x > 330);
      expect(side.length).toBeGreaterThan(0);
      expect(Math.max(...side.map(i => i.x + i.width))).toBeLessThanOrEqual(595.28 - 44 + 1);
    } else {
      const band = Math.round(595.28 * 0.34);
      const inBand = items.filter(i => i.x < band);
      expect(Math.max(...inBand.map(i => i.x + i.width))).toBeLessThanOrEqual(band + 1);
    }
    const text = await pdfText(pdf.buffer);
    expect(text).not.toContain('--');
    expect(text.replace(/\s+/g, '')).toContain(word);
    expect((await exportDocument(w, 'docx')).verification.textVerified).toBe(true);
  }, 30000);

  it('wraps a long link and email in the panel without inserting a hyphen at the break', async () => {
    const w = fixture(); w.layout.columns = 'panel';
    const link = 'https://www.linkedin.com/in/adaeze-nwankwo-pmp-12345678/';
    const email = 'adaeze.nwankwo.projectmanagement@gmail.com';
    w.resume.personal.linkedin = link; w.resume.personal.email = email;
    const pdf = await exportDocument(w, 'pdf');
    expect(pdf.verification.textVerified).toBe(true);
    const flat = (await pdfText(pdf.buffer)).replace(/\s+/g, '');
    expect(flat).toContain(email);
    expect(flat).toContain(link.replace(/^https:\/\//, ''));
  }, 30000);

  it('wraps a long plain web address (no @ or /) in the panel without inserting a hyphen', async () => {
    const w = fixture(); w.layout.columns = 'panel';
    const site = 'theprojectmanagementandprogrammedeliveryconsultancygroup.com';
    w.resume.personal.linkedin = site;
    const pdf = await exportDocument(w, 'pdf');
    expect(pdf.verification.textVerified).toBe(true);
    expect((await pdfText(pdf.buffer)).replace(/\s+/g, '')).toContain(site);
  }, 30000);

  it.each(['right', 'panel'] as const)('hyphenates a very long word with no punctuation inside a %s column', async columns => {
    const w = fixture(); w.layout.columns = columns;
    const word = 'Pneumonoultramicroscopicsilicovolcanoconiosis';
    w.resume.skills = 'Stakeholder management\n' + word;
    const pdf = await exportDocument(w, 'pdf');
    expect(pdf.verification.textVerified).toBe(true);
    const items = await pageItems(pdf.buffer);
    if (columns === 'right') {
      const side = items.filter(i => i.x > 330);
      expect(Math.max(...side.map(i => i.x + i.width))).toBeLessThanOrEqual(595.28 - 44 + 1);
    } else {
      const band = Math.round(595.28 * 0.34);
      expect(Math.max(...items.filter(i => i.x < band).map(i => i.x + i.width))).toBeLessThanOrEqual(band + 1);
    }
    const flat = (await pdfText(pdf.buffer)).replace(/-\s+/g, '').replace(/\s+/g, '');
    expect(flat).toContain(word);
    expect((await exportDocument(w, 'docx')).verification.textVerified).toBe(true);
  }, 30000);

  it('never hyphenates a long word that fits on its own line', async () => {
    const w = fixture(); w.layout.columns = 'right';
    w.resume.skills = 'Electroencephalographically';
    const pdf = await exportDocument(w, 'pdf');
    expect(pdf.verification.textVerified).toBe(true);
    expect(await pdfText(pdf.buffer)).toContain('Electroencephalographically');
  }, 30000);

  it('keeps a long word that fits whole even when it reaches the end of a line', async () => {
    const w = fixture(); w.layout.columns = 'right';
    w.resume.skills = 'Trained in Electroencephalographically guided work';
    const pdf = await exportDocument(w, 'pdf');
    expect(pdf.verification.textVerified).toBe(true);
    expect(await pdfText(pdf.buffer)).toContain('Electroencephalographically');
  }, 30000);

  it('never adds a hyphen inside a long email address in the panel', async () => {
    const w = fixture(); w.layout.columns = 'panel';
    const email = 'nwankwoadaezeprojectmanagerlagosnigeria@gmail.com';
    w.resume.personal.email = email;
    const pdf = await exportDocument(w, 'pdf');
    expect(pdf.verification.textVerified).toBe(true);
    expect((await pdfText(pdf.buffer)).replace(/\s+/g, '')).toContain(email);
    const band = Math.round(595.28 * 0.34);
    const items = (await pageItems(pdf.buffer)).filter(i => i.x < band);
    expect(Math.max(...items.map(i => i.x + i.width))).toBeLessThanOrEqual(band + 1);
  }, 30000);

  it('breaks a long email with digits in it inside the band, without a hyphen', async () => {
    const w = fixture(); w.layout.columns = 'panel';
    const email = 'nwankwoadaezeprojectmanagerlagos2024nigeria@gmail.com';
    w.resume.personal.email = email;
    const pdf = await exportDocument(w, 'pdf');
    expect(pdf.verification.textVerified).toBe(true);
    expect((await pdfText(pdf.buffer)).replace(/\s+/g, '')).toContain(email);
    const band = Math.round(595.28 * 0.34);
    const items = (await pageItems(pdf.buffer)).filter(i => i.x < band);
    expect(Math.max(...items.map(i => i.x + i.width))).toBeLessThanOrEqual(band + 1);
  }, 30000);

  it('exports a very long name in the panel, split across lines inside the band', async () => {
    const w = fixture(); w.layout.columns = 'panel';
    w.resume.personal.fullName = 'Ada Oluwadamilareoluwatobiloba';
    const pdf = await exportDocument(w, 'pdf');
    expect(pdf.verification.textVerified).toBe(true);
    const band = Math.round(595.28 * 0.34);
    const items = (await pageItems(pdf.buffer)).filter(i => i.x < band);
    expect(Math.max(...items.map(i => i.x + i.width))).toBeLessThanOrEqual(band + 1);
  }, 30000);

  it('accepts a word split across lines but not a changed word', () => {
    const w = fixture(); w.layout.columns = 'right';
    w.resume.skills = 'Pneumonoultramicroscopicsilicovolcanoconiosis';
    const blocks = resumeBlocks(w);
    const body = (word: string) => blocks.map(b => b.text.replace('Pneumonoultramicroscopicsilicovolcanoconiosis', word)).join('\n');
    expect(verifyExtractedText(blocks, body('Pneumonoultramicro-\nscopicsilicovolcanoconiosis'), w.resume).textVerified).toBe(true);
    expect(() => verifyExtractedText(blocks, body('Pneumonoultramicro-\nscopicsilicovolcano'), w.resume)).toThrow('missing or reordered');
  });

  it.each(['right', 'panel'] as const)('never doubles a hyphen in ordinary hyphenated words in a %s column', async columns => {
    const w = fixture(); w.layout.columns = columns;
    w.resume.skills = 'Delivery across multi-site programmes for e-commerce and public-sector clients';
    w.resume.personal.fullName = 'Ada Nwankwo-Smith';
    const pdf = await exportDocument(w, 'pdf');
    expect(pdf.verification.textVerified).toBe(true);
    const text = await pdfText(pdf.buffer);
    expect(text).not.toContain('--');
    for (const word of ['multi-site', 'e-commerce', 'Nwankwo-Smith']) expect(text).toContain(word);
  }, 30000);
});

describe('Word coloured panel', () => {
  /** Paragraph XML inside the first (panel) and second (main) table cells of the Word body. */
  async function cellParagraphs(buffer: Buffer) {
    const xml = await (await JSZip.loadAsync(buffer)).file('word/document.xml')!.async('string');
    const cells = xml.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? [];
    const paragraphs = (cell: string) => cell.match(/<w:p>[\s\S]*?<\/w:p>|<w:p [\s\S]*?<\/w:p>/g) ?? [];
    return { panel: paragraphs(cells[0] ?? ''), main: paragraphs(cells[1] ?? '') };
  }
  /** The colour Word gives the paragraph mark (and so the bullet symbol), read only from the paragraph's own properties. */
  const markColour = (p: string) => p.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/)?.[1].match(/<w:color w:val="([0-9A-Fa-f]{6})"/)?.[1];

  it('makes bullets white in the panel and leaves main-column bullets dark', async () => {
    const w = fixture(); w.layout.columns = 'panel';
    w.layout.sideSections = ['experience', 'skills'];
    w.resume.summary = w.resume.summary || 'Project manager.';
    w.resume.volunteering = [{ id: 'v1', role: 'Mentor', organisation: 'Code Club', location: 'Lagos', startDate: 'Jan 2020', endDate: 'Present', achievements: 'Taught 20 students\nRan weekly sessions' }];
    const docx = await exportDocument(w, 'docx');
    expect(docx.verification.textVerified).toBe(true);
    const { panel, main } = await cellParagraphs(docx.buffer);
    const panelBullets = panel.filter(p => p.includes('<w:numPr>'));
    expect(panelBullets.length).toBeGreaterThan(0);
    for (const p of panelBullets) expect(markColour(p)).toBe('FFFFFF');
    const mainBullets = main.filter(p => p.includes('<w:numPr>'));
    expect(mainBullets.length).toBeGreaterThan(0);
    for (const p of mainBullets) expect(markColour(p)).not.toBe('FFFFFF');
  }, 30000);
});
