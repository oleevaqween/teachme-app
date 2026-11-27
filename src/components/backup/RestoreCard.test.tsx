import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { RestoreResultView, RestoreView } from '@/lib/backup/restore-view';
import { RestoreCheck, RestoreDone } from './RestoreCard';

const zero = { inFile: 0, added: 0, same: 0, kept: 0, skipped: 0 };
const summary = { cvWorkspaces: { inFile: 2, added: 1, same: 0, kept: 1, skipped: 0 }, cvVersions: zero, applications: { inFile: 1, added: 0, same: 0, kept: 0, skipped: 1 }, practiceQuestions: zero, practiceAttempts: zero };
const view: RestoreView = {
  exportedAt: '2026-11-16T09:00:00.000Z', summary, versionCopies: 1, addCount: 2, fingerprint: 'f'.repeat(64),
  skipped: [{ kind: 'applications', name: 'Acme · PM', reason: 'This CV already has a tracked application.' }],
  kept: [{ kind: 'cvWorkspaces', name: 'Master CV', versionCopy: true }],
};
const noop = () => {};

describe('restore check', () => {
  it('shows counts per kind, what is skipped and kept, and the exact restore button', () => {
    const html = renderToStaticMarkup(<RestoreCheck view={view} busy={false} onRestore={noop} />);
    expect(html).toContain('Backup from 16 Nov 2026');
    expect(html).toContain('Nothing already in the app will be changed or removed.');
    expect(html).toMatch(/CVs<\/th><td>2<\/td><td>1<\/td><td>0<\/td><td>1<\/td><td>0<\/td>/);
    expect(html).toContain('Acme · PM: This CV already has a tracked application.');
    expect(html).toContain('Master CV: kept yours; the backup copy will be saved as a version.');
    expect(html).toMatch(/Restore 2 items<\/button>/);
  });

  it('says when there is nothing to add and offers no button', () => {
    const html = renderToStaticMarkup(<RestoreCheck view={{ ...view, addCount: 0, skipped: [], kept: [] }} busy={false} onRestore={noop} />);
    expect(html).toContain('Nothing to add: everything in this file is already in the app.');
    expect(html).not.toContain('<button');
  });

  it('uses the singular for one item', () => {
    expect(renderToStaticMarkup(<RestoreCheck view={{ ...view, addCount: 1 }} busy={false} onRestore={noop} />)).toContain('Restore 1 item<');
  });
});

describe('restore result', () => {
  const result: RestoreResultView = { summary, versionCopies: 1, addCount: 2, safetyCopy: 'C:\\data\\restore-safety\\career-20261116-153005.db' };
  it('reports what was added, the safety copy and the reload note', () => {
    const html = renderToStaticMarkup(<RestoreDone result={result} />);
    expect(html).toContain('Restored 2 items.');
    expect(html).toContain('CVs: 1 added');
    expect(html).toContain('1 backup copy saved as a version');
    expect(html).toContain('Safety copy of your data before the restore: C:\\data\\restore-safety\\career-20261116-153005.db');
    expect(html).toContain('Reload any open CV Studio tabs to see restored CVs.');
  });
  it('explains when no safety copy was needed', () => {
    expect(renderToStaticMarkup(<RestoreDone result={{ ...result, safetyCopy: null }} />)).toContain('No safety copy was needed: there was no career data yet.');
  });
});

describe('screening answers in a restore', () => {
  it('says what happens to them, and nothing for older backups', () => {
    expect(renderToStaticMarkup(<RestoreCheck view={{ ...view, screeningProfile: 'add' }} busy={false} onRestore={noop} />)).toContain('Screening answers: will be added');
    expect(renderToStaticMarkup(<RestoreCheck view={{ ...view, screeningProfile: 'kept' }} busy={false} onRestore={noop} />)).toContain('Screening answers: kept yours');
    expect(renderToStaticMarkup(<RestoreCheck view={view} busy={false} onRestore={noop} />)).not.toContain('Screening answers');
    expect(renderToStaticMarkup(<RestoreDone result={{ summary, versionCopies: 0, addCount: 1, safetyCopy: null, screeningProfileAdded: true }} />)).toContain('Screening answers: added');
  });

  it('says when they are already here or were skipped', () => {
    expect(renderToStaticMarkup(<RestoreCheck view={{ ...view, screeningProfile: 'same' }} busy={false} onRestore={noop} />)).toContain('Screening answers: already here');
    expect(renderToStaticMarkup(<RestoreCheck view={{ ...view, screeningProfile: 'skip' }} busy={false} onRestore={noop} />)).toContain('Screening answers: skipped (still safe in your backup file)');
  });
});
