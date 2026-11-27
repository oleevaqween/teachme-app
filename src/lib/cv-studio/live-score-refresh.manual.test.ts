import assert from 'node:assert/strict';
import { basename } from 'node:path';
import { test } from 'vitest';
import { jobMatchEstimate } from './job-match';
import { jobRubric } from './job-rubric';
import type { SavedWorkspace } from './schema';

const liveTest = process.env.TEACHME_LIVE_SCORE_CHECK === '1' ? test : test.skip;
liveTest('live refresh keeps the saved rubric and does not lower an unchanged CV score', async () => {
  assert.equal(basename(process.cwd()), 'teachme-cv-lab');
  const endpoint = 'http://127.0.0.1:3100/api/cv-studio';
  const before = await (await fetch(endpoint)).json() as { workspaces: SavedWorkspace[] };
  const source = before.workspaces.find(workspace => workspace.id === '12d63b58-9806-4ab3-8cc0-44dc41109196');
  assert.ok(source?.analysis, 'Reported application or its analysis was not found.');
  const currentScore = jobMatchEstimate(source).score;
  const oldRubric = jobRubric(source.jobDescription, source.analysis);
  assert.ok(oldRubric, 'The saved analysis has no verified job rubric.');

  const response = await fetch(endpoint + '/prepare', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspace: source, action: 'analyze' }), signal: AbortSignal.timeout(260000) });
  const payload = await response.json();
  assert.ok(response.ok, payload.error ?? 'Live refresh failed.');
  const refreshed = { ...source, analysis: payload.result, analysisInput: payload.input };
  const newRubric = jobRubric(source.jobDescription, refreshed.analysis);
  assert.deepEqual(newRubric, oldRubric, 'An unchanged posting received a different scoring rubric.');
  const refreshedScore = jobMatchEstimate(refreshed).score;
  assert.ok(currentScore !== null && refreshedScore !== null);
  assert.ok(refreshedScore >= currentScore, `Unchanged CV score fell from ${currentScore} to ${refreshedScore}.`);

  const after = await (await fetch(endpoint)).json();
  assert.deepEqual(after, before, 'The read-only score refresh changed saved workspaces.');
  console.log(JSON.stringify({ savedWorkspacesUnchanged: true, currentScore, refreshedScore,
    requirements: newRubric.requirements.length, keywords: newRubric.keywords.length }, null, 2));
}, 280000);
