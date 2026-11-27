'use client';
import { useMemo } from 'react';
import type { Resume } from '@/lib/cv-studio/schema';
import { firstCheck, LAYOUT_ISSUES, missingLines, type ImportDiagnosis } from '@/lib/cv-studio/import-diagnosis';

const CHECK_UNAVAILABLE = 'Import check unavailable.';
const LAYOUT_TIP = "When you apply, send a CV downloaded from CV Studio; it's single-column and checked to read correctly.";

/** Runs one part of the check; a failure shows "Import check unavailable." in that part only. */
function attempt<T>(part: () => T): T | null {
  try {
    return part();
  } catch (error) {
    console.warn('Import check part failed:', error);
    return null;
  }
}

/**
 * The Import check box on the import review screen: how cleanly the CV was read (from the server),
 * which original lines may be missing from the fields, and a first CV checker score. Advice only; it never edits the fields.
 */
export function ImportCheck({ diagnosis, sourceText, resume, now }: { diagnosis: ImportDiagnosis | null | undefined; sourceText: string; resume: Resume; now?: Date }) {
  const missing = useMemo(() => attempt(() => missingLines(sourceText, resume)), [sourceText, resume]);
  const check = useMemo(() => attempt(() => firstCheck(resume, now ?? new Date())), [resume, now]);
  const issues = diagnosis?.issues;
  return <section className="import-check" aria-labelledby="import-check-title">
    <h3 id="import-check-title" className="subheading">Import check</h3>

    <h4>How cleanly your CV was read</h4>
    {!issues ? <p>{CHECK_UNAVAILABLE}</p> : issues.length === 0 ? <p>Your CV was read cleanly.</p> : <>
      {issues.map(issue => <div key={issue.id} className="finding warning"><strong>{issue.title}</strong><p>{issue.advice}</p></div>)}
      {issues.some(issue => LAYOUT_ISSUES.includes(issue.id)) && <p className="studio-hint">{LAYOUT_TIP}</p>}
    </>}

    <h4>Possibly missing from the fields</h4>
    {!missing ? <p>{CHECK_UNAVAILABLE}</p> : missing.lines.length === 0 ? <p>Everything in your original appears in the fields.</p> : <>
      <p className="studio-hint">Add anything that belongs in your CV before saving.</p>
      <ul className="import-check-lines">{missing.lines.map((line, index) => <li key={index}>{line}</li>)}</ul>
      {missing.more > 0 && <p className="studio-hint">{`and ${missing.more} more`}</p>}
    </>}

    <h4>First check</h4>
    {!check ? <p>{CHECK_UNAVAILABLE}</p> : <>
      <p><strong>{`Score: ${check.score} out of 100`}</strong></p>
      {check.fixes.map(title => <div key={title} className="finding warning"><strong>{title}</strong></div>)}
      <p className="studio-hint">The full checker, including spelling, is in CV Studio after you save.</p>
    </>}
  </section>;
}
