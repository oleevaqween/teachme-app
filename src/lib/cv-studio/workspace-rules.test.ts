import { describe, expect, it } from 'vitest';
import type { Analysis, ApplicationPackage, Workspace } from './schema';
import { fixture } from './test-fixture';
import { analysisName, applicationFromMaster, branchSource, carryPracticeAnswers, DEFAULT_APPLICATION_NAME, nameAfterAnalysis, pickInitialWorkspace, saveFailureKind } from './workspace-rules';

const pack = (interview: ApplicationPackage['interview']): ApplicationPackage => ({
  coverLetter: 'Letter', coverLetterApproved: false, interview, learningPriorities: [],
});
const q = (question: string, practiceAnswer?: string) => ({ question, guidance: 'Use STAR.', evidence: [], practiceAnswer });

describe('carryPracticeAnswers', () => {
  it('moves answers onto regenerated questions with the same wording', () => {
    const result = carryPracticeAnswers(
      pack([q('Tell me about a project you rescued?', 'The Lagos rollout…')]),
      pack([q('  tell me about a project   you rescued '), q('Why this company?')]),
    );
    expect(result.package.interview[0].practiceAnswer).toBe('The Lagos rollout…');
    expect(result.package.interview).toHaveLength(2);
    expect(result).toMatchObject({ carried: 1, notCarried: 0 });
  });

  it('keeps answers whose question disappeared by appending that question', () => {
    const result = carryPracticeAnswers(pack([q('Old question', 'My answer')]), pack([q('New question')]));
    expect(result.package.interview.map(x => x.question)).toEqual(['New question', 'Old question']);
    expect(result.package.interview[1].practiceAnswer).toBe('My answer');
    expect(result.carried).toBe(1);
  });

  it('never overwrites an answer already present on the new question', () => {
    const result = carryPracticeAnswers(pack([q('Same', 'old')]), pack([q('Same', 'new')]));
    expect(result.package.interview[0].practiceAnswer).toBe('new');
  });

  it('respects the 12-question cap and reports what could not be carried', () => {
    const fresh = pack(Array.from({ length: 11 }, (_, i) => q('New ' + i)));
    const result = carryPracticeAnswers(pack([q('Gone A', 'a'), q('Gone B', 'b')]), fresh);
    expect(result.package.interview).toHaveLength(12);
    expect(result).toMatchObject({ carried: 1, notCarried: 1 });
  });

  it('ignores blank answers and missing previous packs', () => {
    expect(carryPracticeAnswers(null, pack([q('A')])).carried).toBe(0);
    expect(carryPracticeAnswers(pack([q('A', '   ')]), pack([q('B')])).package.interview).toHaveLength(1);
  });
});

describe('nameAfterAnalysis', () => {
  const analysis = { role: 'Project Manager', company: 'Acme' } as Analysis;

  it('names a new application from the analysed role and company', () => {
    expect(nameAfterAnalysis({ name: DEFAULT_APPLICATION_NAME, analysis: null }, analysis)).toBe('Project Manager · Acme');
  });

  it('updates a name that is still the previous automatic name', () => {
    const previous = { role: 'Analyst', company: 'Old Co' } as Analysis;
    expect(nameAfterAnalysis({ name: analysisName(previous), analysis: previous }, analysis)).toBe('Project Manager · Acme');
  });

  it('never replaces a name the user typed', () => {
    expect(nameAfterAnalysis({ name: 'Acme PM, applied 3 Nov', analysis }, analysis)).toBe('Acme PM, applied 3 Nov');
  });

  it('keeps the current name when the analysis has no role or company', () => {
    expect(nameAfterAnalysis({ name: DEFAULT_APPLICATION_NAME, analysis: null }, { role: '', company: '' } as Analysis)).toBe(DEFAULT_APPLICATION_NAME);
  });
});

describe('branchSource', () => {
  const master = { ...fixture(), id: 'master', kind: 'master', parentId: null } as Workspace;
  const appA = { ...fixture(), id: 'appA', kind: 'application', parentId: 'master', name: 'A' } as Workspace;
  const appB = { ...fixture(), id: 'appB', kind: 'application', parentId: 'appA', name: 'B' } as Workspace;

  it('copies from the master even when an application is open', () => {
    expect(branchSource(appA, [master, appA]).id).toBe('master');
    expect(branchSource(appB, [master, appA, appB]).id).toBe('master');
  });

  it('uses the master itself when the master is open', () => {
    expect(branchSource(master, [master, appA]).id).toBe('master');
  });

  it('falls back to the open workspace when its master is missing or the chain loops', () => {
    expect(branchSource(appA, [appA]).id).toBe('appA');
    const loopA = { ...appA, parentId: 'appB' }, loopB = { ...appB, parentId: 'appA' };
    expect(branchSource(loopA, [loopA, loopB]).id).toBe('appA');
  });
});

describe('saveFailureKind', () => {
  it('pauses only for edit conflicts', () => {
    expect(saveFailureKind({ status: 409 })).toBe('conflict');
  });
  it('waits for the next edit when the server rejects the content', () => {
    expect(saveFailureKind({ status: 400 })).toBe('fix');
    expect(saveFailureKind({ status: 413 })).toBe('fix');
  });
  it('retries connection failures and server errors', () => {
    expect(saveFailureKind(new TypeError('Failed to fetch'))).toBe('retry');
    expect(saveFailureKind({ status: 500 })).toBe('retry');
  });
});

describe('pickInitialWorkspace', () => {
  const list = [{ id: 'recent' }, { id: 'acme' }];
  it('opens the workspace named in ?open=', () => {
    expect(pickInitialWorkspace(list, '?open=acme')?.id).toBe('acme');
  });
  it('falls back to the most recent workspace when the link is missing or unknown', () => {
    expect(pickInitialWorkspace(list, '')?.id).toBe('recent');
    expect(pickInitialWorkspace(list, '?open=deleted')?.id).toBe('recent');
    expect(pickInitialWorkspace([], '?open=acme')).toBeUndefined();
  });
});

describe('applicationFromMaster', () => {
  it('carries the letter inputs, including the employer text, into the new application', () => {
    const master: Workspace = { ...fixture(), id: 'master', kind: 'master', parentId: null, letterBrief: 'My angle.', letterTone: 'warm', letterOpening: 'achievement-led', companyNotes: 'Acme builds solar microgrids.' };
    const base: Workspace = { ...fixture(), id: 'new', name: 'New application', parentId: 'master', jobDescription: '' };
    const next = applicationFromMaster(master, base);
    expect(next).toMatchObject({ id: 'new', jobDescription: master.jobDescription, letterBrief: 'My angle.', letterTone: 'warm', letterOpening: 'achievement-led', companyNotes: 'Acme builds solar microgrids.' });
  });
  it('copies the evidence guides instead of sharing them', () => {
    const master: Workspace = { ...fixture(), kind: 'master', evidenceGuides: [] };
    const next = applicationFromMaster(master, fixture());
    expect(next.evidenceGuides).toEqual([]);
    expect(next.evidenceGuides).not.toBe(master.evidenceGuides);
    expect(applicationFromMaster({ ...fixture(), kind: 'master' }, fixture()).evidenceGuides).toBeUndefined();
  });
});
