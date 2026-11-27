import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { WorkspaceSchema, inputSignature, analysisSignature, type Workspace } from './schema';
import { resumeBlocks } from './export';
import { jobMatchEstimate } from './job-match';

/**
 * Compatibility check against a COPY of the owner's career database, never the live file.
 * CV_COMPAT_DB: absolute path to the copy. CV_COMPAT_WRITE=1 records the baseline instead of comparing.
 * Only row ids and SHA-256 hashes are written; no CV text leaves the database copy.
 */
const dbPath = process.env.CV_COMPAT_DB;
const baselinePath = path.resolve('.superpowers/sdd/baseline-hashes.json');
const writing = process.env.CV_COMPAT_WRITE === '1';
const extraKeys = ['volunteering', 'languages', 'awards', 'training', 'publications', 'strengths', 'interests', 'references'];
const hash = (value: unknown) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');

function withoutEmptyExtras(resume: Record<string, unknown>) {
  const copy = { ...resume };
  for (const key of extraKeys) {
    const value = copy[key];
    if (value === '' || (Array.isArray(value) && value.length === 0)) delete copy[key];
  }
  return copy;
}

function fingerprint(body: string) {
  try {
    const w: Workspace = WorkspaceSchema.parse(JSON.parse(body));
    return {
      resume: hash(withoutEmptyExtras(w.resume as unknown as Record<string, unknown>)), layout: hash(w.layout),
      input: hash(inputSignature(w)), analysis: hash(analysisSignature(w)), blocks: hash(resumeBlocks(w)), match: hash(jobMatchEstimate(w)),
    };
  } catch {
    return { unparseable: true };
  }
}

describe.skipIf(!dbPath || (!writing && !existsSync(baselinePath)))('real career data stays compatible', () => {
  it('parses every saved CV and version with unchanged content, fingerprints and output', async () => {
    if (!existsSync(dbPath!)) throw new Error('CV_COMPAT_DB does not exist: ' + dbPath);
    if (dbPath!.replace(/\\/g, '/').endsWith('/.data/career.db') || path.resolve(dbPath!).startsWith(path.resolve('.'))) throw new Error('Point CV_COMPAT_DB at a temporary copy, never the live database.');
    const client = createClient({ url: 'file:' + dbPath, concurrency: 1 });
    try {
      await client.execute('PRAGMA query_only = ON');
      const workspaces = await client.execute('SELECT id, body FROM cv_workspace ORDER BY id');
      const versions = await client.execute('SELECT id, body FROM cv_version ORDER BY id');
      const current: Record<string, unknown> = {};
      for (const row of workspaces.rows) current['workspace:' + String(row.id)] = fingerprint(String(row.body));
      for (const row of versions.rows) current['version:' + String(row.id)] = fingerprint(String(row.body));
      if (writing) {
        mkdirSync(path.dirname(baselinePath), { recursive: true });
        writeFileSync(baselinePath, JSON.stringify(current, null, 1));
        expect(Object.keys(current).length).toBeGreaterThan(0);
        return;
      }
      const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
      expect(Object.keys(current).sort()).toEqual(Object.keys(baseline).sort());
      expect(current).toEqual(baseline);
    } finally {
      client.close();
    }
  });
});
