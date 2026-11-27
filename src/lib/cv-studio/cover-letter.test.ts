import { describe, expect, it } from 'vitest';
import { EMPLOYER_SOURCES, letterCatalog, letterParagraphs, letterVoice, letterChecks, letterSpecificity, letterStyleIssues, normalizeLetter, spliceLetterParagraph, unavailableLetter, validateLetterAudit } from './cover-letter';
import { makeWorkspace } from '@/components/cv-studio/useWorkspace';
import { fixture } from './test-fixture';
import { analysisSignature, evidenceCatalog, inputSignature, PackageSchema, WorkspaceSchema, type Workspace } from './schema';

const letter = 'Dear Hiring Manager,\n\nI am applying for the advertised role. At Example Ltd, my work included preparing monthly reports for 4 stakeholders.\n\nThis experience is relevant to your monthly reporting requirement.\n\nThank you for considering my application. I would welcome a conversation about the role.\n\nKind regards,\nAda Okoro';
const audit = () => ({ checks: letter.split(/\n\s*\n/).map((_, index) => ({ index, supported: true, candidateClaims: index === 1 || index === 2,
  evidence: index === 1 || index === 2 ? [{ source: 'experience.e1', quote: 'Prepared monthly reports for 4 stakeholders.' }] : [], unsupportedClaims: [] as string[],
})) });

describe('Cover letter quality and evidence checks', () => {
  it('makes paragraph count advisory without relaxing factual checks', () => {
    const extended = letter.replace('Thank you', 'I would welcome a conversation.\n\nReporting matters to this role.\n\nThank you');
    expect(letterChecks(extended, fixture()).issues).toEqual([]);
    expect(letterChecks(extended, fixture()).warnings.join(' ')).toContain('3-4');
    expect(letterChecks(extended.replace('4 stakeholders', '999 stakeholders'), fixture()).issues.join(' ')).toContain('unsupported numbers');
  });
  it('still rejects missing salutation, sign-off, and a body-free letter', () => {
    expect(letterChecks('Dear Hiring Manager,\n\nKind regards,\nAda Okoro', fixture()).issues.join(' ')).toContain('substantive body');
    expect(letterChecks('A short text', fixture()).issues.join(' ')).toContain('salutation');
    expect(letterChecks(letter.replace('Ada Okoro', 'Someone Else'), fixture()).issues.join(' ')).toContain('candidate name');
  });
  it('accepts narrative paraphrasing with genuine source citations', () => {
    expect(letterStyleIssues(letter, fixture())).toEqual([]);
    expect(validateLetterAudit(letter, audit(), fixture()).issues).toEqual([]);
  });
  it('accepts a conventional blank line between the sign-off and name', () => {
    const spaced = letter.replace('Kind regards,\nAda', 'Kind regards,\n\nAda');
    expect(normalizeLetter(spaced)).toBe(letter);
    expect(letterStyleIssues(spaced, fixture())).toEqual([]);
  });
  it('rewrites a Best or Warm regards closing to Kind regards and no longer accepts Best regards', () => {
    expect(normalizeLetter(letter.replace('Kind regards,', 'Best regards,'))).toBe(letter);
    expect(normalizeLetter(letter.replace('Kind regards,', 'Warm regards,\n'))).toBe(letter);
    // The style check sees the normalised letter, so a rewritten closing passes.
    expect(letterStyleIssues(letter.replace('Kind regards,', 'Best regards,'), fixture())).toEqual([]);
    expect(letterStyleIssues(letter.replace('Kind regards,', 'Cheers,'), fixture()).join(' ')).toContain('sign-off');
    for (const close of ['Kind regards', 'Yours sincerely', 'Yours faithfully', 'Sincerely', 'Regards']) expect(letterStyleIssues(letter.replace('Kind regards', close), fixture())).toEqual([]);
  });
  it('requires quote objects rather than naked source IDs', () => {
    const raw = audit();
    const malformed = { checks: raw.checks.map(c => ({ ...c, evidence: c.evidence.map(e => e.source) })) };
    expect(validateLetterAudit(letter, malformed, fixture()).issues.join(' ')).toContain('incomplete response');
  });
  it('maps only known short IDs back to their original sources', () => {
    const raw = audit(); raw.checks[1].evidence[0].source = 'E1';
    const result = validateLetterAudit(letter, raw, fixture(), { E1: 'experience.e1' });
    expect(result.issues).toEqual([]);
    expect(result.review[1].evidence[0].source).toBe('experience.e1');
    raw.checks[1].evidence[0].source = 'E99';
    expect(validateLetterAudit(letter, raw, fixture(), { E1: 'experience.e1' }).issues.join(' ')).toContain('citation');
  });
  it('recovers whitespace-only citation differences without weakening source matching', () => {
    const w = fixture(); w.resume.experience[0].achievements = 'Prepared monthly\nreports for 4 stakeholders.';
    const result = validateLetterAudit(letter, audit(), w);
    expect(result.issues).toEqual([]);
    expect(result.review[1].evidence[0].quote).toContain('\n');
  });
  it('does not accept rewritten source quotes or changed metrics', () => {
    const raw = audit(); raw.checks[1].evidence[0].quote = 'Produced monthly reports for 4 stakeholders.';
    expect(validateLetterAudit(letter, raw, fixture()).issues.join(' ')).toContain('citation');
    expect(validateLetterAudit(letter.replace('4 stakeholders', '40 stakeholders'), audit(), fixture()).issues.join(' ')).toContain('Numeric candidate claims');
  });
  it('rejects missing, duplicate, and empty substantive citations', () => {
    const raw = audit(); raw.checks[1].evidence = [];
    expect(validateLetterAudit(letter, raw, fixture()).issues.join(' ')).toContain('Candidate claims need');
    raw.checks.push(raw.checks[0]);
    expect(validateLetterAudit(letter, raw, fixture()).issues.join(' ')).toContain('duplicate');
    expect(validateLetterAudit(letter, { checks: [] }, fixture()).issues.length).toBeGreaterThan(0);
  });
  it('does not treat a job citation as candidate evidence', () => {
    const raw = audit(); raw.checks[1].evidence = [{ source: 'job', quote: 'monthly reporting' }];
    expect(validateLetterAudit(letter, raw, fixture()).issues.join(' ')).toContain('not just the posting');
  });
  it('rejects unsupported meanings even when the quotes exist', () => {
    const raw = audit(); raw.checks[1].supported = false; raw.checks[1].unsupportedClaims = ['Do not convert supporting a team into leading it.'];
    expect(validateLetterAudit(letter, raw, fixture()).issues.join(' ')).toContain('leading');
  });
  it('preserves object-shaped rejection reasons instead of accepting or losing them', () => {
    const raw = audit();
    const objectReasons = { checks: raw.checks.map(c => c.index === 1 ? { ...c, unsupportedClaims: [{ claim: 'Guaranteed results', reason: 'Not recorded' }] } : c) };
    const result = validateLetterAudit(letter, objectReasons, fixture());
    expect(result.issues.join(' ')).toContain('Not recorded');
    expect(result.issues.join(' ')).not.toContain('incomplete response');
  });
  it('flags CV extracts, missing structure, excessive length and copied bullets', () => {
    const w = fixture(), extract = w.resume.experience[0].achievements;
    expect(letterStyleIssues('Dear Hiring Team,\n\nBelow is my career record:\n• ' + extract + '\n\nRegards,\nAda Okoro', w).join(' ')).toMatch(/narrative/);
    expect(letterStyleIssues(letter.replace('Thank you', 'word '.repeat(400) + 'Thank you'), w).join(' ')).toContain('350');
    w.resume.experience[0].achievements = 'Prepared monthly reports for four key stakeholders.\nManaged budgets for the regional delivery team.';
    expect(letterStyleIssues(letter + '\n\n' + w.resume.experience[0].achievements, w).join(' ')).toContain('copied verbatim');
  });
  it('keeps the previous letter untouched and unapproved after failed regeneration', () => {
    const w = fixture(); w.package = PackageSchema.parse({ coverLetter: letter, coverLetterApproved: true, interview: [], learningPriorities: [] });
    const before = structuredClone(w), result = unavailableLetter(w, ['Citation check failed.']);
    expect(result.coverLetter).toBe(letter);
    expect(result.coverLetterApproved).toBe(false);
    expect(result.letterStatus).toBe('retained');
    expect(w).toEqual(before);
  });
  it('does not manufacture a substitute letter from career facts', () => {
    expect(unavailableLetter(fixture(), ['Check unavailable.']).coverLetter).toBe('');
  });
  it('keeps old saves compatible and binds the optional angle to regeneration', () => {
    const w = fixture(), signature = inputSignature(w);
    expect(WorkspaceSchema.parse(w).letterBrief).toBeUndefined();
    w.letterBrief = ''; expect(inputSignature(w)).toBe(signature);
    w.letterBrief = 'I want to apply my reporting experience to service delivery.';
    expect(inputSignature(w)).not.toBe(signature);
    expect(letterCatalog(w).letterBrief).toBe(w.letterBrief);
    expect(w.resume).toEqual(fixture().resume);
  });
  it('flags a stock opening and repeated checklist bridges', () => {
    const bland = letter.replace('I am applying for the advertised role.', 'I am writing to apply for the advertised role.');
    expect(letterStyleIssues(bland, fixture()).join(' ')).toContain('stock application opening');
    const checklist = letter + '\nThis is relevant to your needs. This is comparable to your requirements.';
    expect(letterStyleIssues(checklist, fixture()).join(' ')).toContain('requirement-matching');
  });
  it('rejects repeated sentences and binds writing preferences to regeneration', () => {
    const sentence = 'Monthly reporting was an important part of my work with this team.';
    expect(letterStyleIssues(letter + '\n' + sentence + ' ' + sentence, fixture()).join(' ')).toContain('repeated sentences');
    const w = fixture(), original = inputSignature(w);
    w.letterTone = 'warm'; expect(inputSignature(w)).not.toBe(original);
    const warm = inputSignature(w); w.letterOpening = 'achievement-led';
    expect(inputSignature(w)).not.toBe(warm);
    expect(WorkspaceSchema.parse(w).letterTone).toBe('warm');
  });
});

describe('letter voice', () => {
  it('allows the candidate\'s own terms and flags AI tells', () => {
    const w = fixture();
    const own = letterVoice('Dear Ms Bello,\n\nI prepared monthly reports for 4 stakeholders. They used them to plan.\n\nKind regards,\n' + w.resume.personal.fullName, w);
    expect(own.map(i => i.rule)).not.toContain('banned:stakeholder');
    const tells = letterVoice('Dear Ms Bello,\n\nI leveraged data; it was not just fast but cheap. The board agreed.\n\nBest regards,\n' + w.resume.personal.fullName, w);
    expect(tells.map(i => i.rule)).toEqual(expect.arrayContaining(['banned:leverage', 'semicolon', 'not-x-but-y', 'stock:best regards']));
  });
  it("does not treat the employer's own text as the candidate's voice", () => {
    const w = { ...fixture(), companyNotes: 'We leverage technology to reach rural clinics.' };
    const letterText = 'Dear Ms Bello,\n\nI leveraged monthly reports to plan delivery.\n\nKind regards,\n' + w.resume.personal.fullName;
    expect(letterVoice(letterText, w).map(i => i.rule)).toContain('banned:leverage');
  });
});

const withCompany = (notes = 'Acme builds solar microgrids for 300 rural clinics.'): Workspace => ({
  ...fixture(), companyNotes: notes,
  analysis: { role: 'Project Manager', company: 'Acme', overview: '', requirements: [], suggestions: [], questions: [] },
});
const LETTER = 'Dear Hiring Manager,\n\nAcme is bringing power to rural clinics.\n\nI prepared monthly reports for 4 stakeholders.\n\nKind regards,\nAda Okoro';

describe('employer material', () => {
  it('is a letter source but never candidate evidence', () => {
    const w = withCompany();
    expect(letterCatalog(w).company).toBe('Acme builds solar microgrids for 300 rural clinics.');
    expect(evidenceCatalog(w)).not.toHaveProperty('company');
    expect(letterCatalog(fixture())).not.toHaveProperty('company');
    expect([...EMPLOYER_SOURCES].sort()).toEqual(['company', 'job']);
  });
  it('makes the pack stale but not the analysis, is limited to 6000 characters, and is not copied to applications', () => {
    const before = fixture(), after = withCompany();
    expect(inputSignature({ ...after, analysis: before.analysis })).not.toBe(inputSignature(before));
    expect(analysisSignature({ ...after, analysis: before.analysis })).toBe(analysisSignature(before));
    expect(inputSignature({ ...before, companyNotes: undefined })).toBe(inputSignature(before));
    expect(WorkspaceSchema.safeParse({ ...before, companyNotes: 'x'.repeat(6001) }).success).toBe(false);
    expect(makeWorkspace('Application', 'application', { ...before, kind: 'master', companyNotes: 'About Acme' })).not.toHaveProperty('companyNotes');
  });
  it('cannot support candidate claims or candidate numbers in the paragraph audit', () => {
    const w = withCompany();
    const raw = { checks: [0, 1, 2, 3].map(index => ({ index, supported: true, candidateClaims: index === 2, unsupportedClaims: [],
      evidence: index === 1 ? [{ source: 'company', quote: 'solar microgrids' }] : index === 2 ? [{ source: 'company', quote: '300 rural clinics' }] : [] })) };
    const { issues } = validateLetterAudit(LETTER, raw, w);
    expect(issues.join(' ')).toContain('Paragraph 3: Candidate claims need candidate evidence');
  });
  it('traces a citation that uses the request-local alias for the employer text', () => {
    const w = withCompany();
    const raw = { checks: [0, 1, 2, 3].map(index => ({ index, supported: true, candidateClaims: index === 2, unsupportedClaims: [],
      evidence: index === 1 ? [{ source: 'E9', quote: 'solar microgrids' }, { source: 'E9', quote: 'rural clinics' }] : index === 2 ? [{ source: 'E1', quote: 'Prepared monthly reports for 4 stakeholders.' }] : [] })) };
    const result = validateLetterAudit(LETTER, raw, w, { E1: 'experience.e1', E9: 'company' });
    expect(result.issues.join(' ')).not.toContain('could not be traced');
    expect(result.issues).toEqual([]);
    expect(result.review[1].evidence.map(e => e.source)).toEqual(['company', 'company']);
  });
  it('does not let a number in the employer quote support a candidate number', () => {
    const w = withCompany();
    const letterText = 'Dear Hiring Manager,\n\nAcme is bringing power to rural clinics.\n\nI prepared monthly reports for 300 clinics.\n\nKind regards,\nAda Okoro';
    const raw = { checks: [0, 1, 2, 3].map(index => ({ index, supported: true, candidateClaims: index === 2, unsupportedClaims: [],
      evidence: index === 1 ? [{ source: 'company', quote: 'rural clinics' }] : index === 2 ? [{ source: 'experience.e1', quote: 'Prepared monthly reports for 4 stakeholders.' }, { source: 'company', quote: '300 rural clinics' }] : [] })) };
    expect(validateLetterAudit(letterText, raw, w).issues.join(' ')).toContain('Numeric candidate claims must be supported by this paragraph’s candidate citations.');
  });
});

describe('is it specific?', () => {
  it('finds a concrete example and an employer reason in the body', () => {
    expect(letterSpecificity(LETTER, withCompany())).toEqual({ example: true, employer: true, company: 'Acme' });
  });
  it('flags a letter without a number from the candidate evidence or without the company in the body', () => {
    const vague = 'Dear Acme team,\n\nI am keen on this role.\n\nI work well with people.\n\nKind regards,\nAda Okoro';
    expect(letterSpecificity(vague, withCompany())).toEqual({ example: false, employer: false, company: 'Acme' });
    const wrongNumber = 'Dear Hiring Manager,\n\nAcme matters.\n\nI led 12 projects.\n\nKind regards,\nAda Okoro';
    expect(letterSpecificity(wrongNumber, withCompany()).example).toBe(false);
  });
  it('skips the employer check when no company name is known', () => {
    expect(letterSpecificity(LETTER, { ...withCompany(), analysis: null }).employer).toBeNull();
  });
  it('does not count a year as a concrete example', () => {
    const w = { ...withCompany(), evidenceNotes: 'Working in reporting since 2019.' };
    const yearOnly = 'Dear Hiring Manager,\n\nAcme matters to me.\n\nSince 2019 I have prepared reports.\n\nKind regards,\nAda Okoro';
    expect(letterSpecificity(yearOnly, w).example).toBe(false);
  });
  it('matches the company name as a whole word', () => {
    const w = withCompany();
    w.analysis = { ...w.analysis!, company: 'EY' };
    const they = 'Dear Hiring Manager,\n\nThey need monthly reports.\n\nI prepared monthly reports for 4 stakeholders.\n\nKind regards,\nAda Okoro';
    expect(letterSpecificity(they, w).employer).toBe(false);
    expect(letterSpecificity(they.replace('They need', 'At ey, the team needs'), w).employer).toBe(true);
  });
  it('ignores a legal suffix on the company name', () => {
    const w = withCompany();
    w.analysis = { ...w.analysis!, company: 'Acme Ltd' };
    expect(letterSpecificity(LETTER, w)).toEqual({ example: true, employer: true, company: 'Acme Ltd' });
    w.analysis = { ...w.analysis!, company: 'Acme Corporation' };
    expect(letterSpecificity(LETTER, w).employer).toBe(true);
  });
});

describe('splicing a rewritten paragraph into a Windows letter', () => {
  it('replaces the paragraph letterParagraphs counts, keeps everything else and turns CRLF into LF', () => {
    const crlf = 'Dear Hiring Manager,\r\n\r\nOld paragraph.\r\n\r\nSecond paragraph.\r\n\r\nKind regards,\r\nAda Okoro';
    expect(letterParagraphs(crlf)[1]).toBe('Old paragraph.');
    expect(spliceLetterParagraph(crlf, 1, 'New paragraph.')).toBe('Dear Hiring Manager,\n\nNew paragraph.\n\nSecond paragraph.\n\nKind regards,\nAda Okoro');
    expect(spliceLetterParagraph(crlf, 3, 'Best wishes,\nAda Okoro')).toBe('Dear Hiring Manager,\n\nOld paragraph.\n\nSecond paragraph.\n\nBest wishes,\nAda Okoro');
    expect(spliceLetterParagraph(crlf, 4, 'x')).toBeNull();
  });
});
