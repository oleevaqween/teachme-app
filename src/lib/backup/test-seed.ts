import type { Client } from '@libsql/client';
import { createApplicationRepository } from '@/lib/applications/repository';
import { blankApplicationInput } from '@/lib/applications/schema';
import { createRepository } from '@/lib/cv-studio/repository';
import type { Workspace } from '@/lib/cv-studio/schema';
import { fixture } from '@/lib/cv-studio/test-fixture';
import { packQuestionKey } from '@/lib/practice/question-key';
import { createPracticeRepository } from '@/lib/practice/repository';

/** Test-only: fills all five career tables through the real repositories (temp databases only). */
export async function seedCareerData(client: Client): Promise<void> {
  const cv = createRepository(client);
  const app: Workspace = {
    ...fixture(), id: 'app-1', name: 'Acme PM',
    package: { coverLetter: 'Letter', coverLetterApproved: false, learningPriorities: [], interview: [{ question: 'Tell me about a budget you managed.', guidance: '', evidence: [] }] },
    packageInput: null,
  };
  await cv.save({ ...fixture(), id: 'master', kind: 'master', parentId: null, name: 'Master CV' }, 0);
  await cv.save(app, 0);
  await cv.save({ ...app, name: 'Acme PM (edited)' }, 1, 'Edited');
  await createApplicationRepository(client).create(blankApplicationInput({ workspaceId: 'app-1', company: 'Acme', role: 'Project Manager' }));
  const practice = createPracticeRepository(client);
  await practice.insertQuestions('app-1', [{ question: 'Why Acme?', guidance: '', kind: 'company' }], new Date('2026-11-15T10:00:00.000Z'));
  await practice.insertAttempt({
    id: 'attempt-1', workspaceId: 'app-1', questionKey: packQuestionKey('Tell me about a budget you managed.'),
    questionText: 'Tell me about a budget you managed.', followUpOf: null,
    answer: 'I managed the yearly budget and reported monthly.', durationSeconds: 80, inputMethod: 'typed', score: 7,
    star: { situation: { rating: 'strong', note: '' }, task: { rating: 'weak', note: '' }, action: { rating: 'strong', note: '' }, result: { rating: 'missing', note: '' } },
    fixes: ['Add the outcome.'], rewrite: null, rewriteWithheld: null, followUpQuestion: null, createdAt: '2026-11-15T11:00:00.000Z',
  });
}
