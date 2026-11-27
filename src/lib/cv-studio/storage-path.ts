import path from 'node:path';
import { existsSync, lstatSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * Resolve CV Studio storage without ever allowing it to become the TeachMe
 * Prisma database. The sole override is a fixed, ignored directory reserved
 * for copied-data integration tests; arbitrary paths are deliberately rejected.
 */
export function resolveCareerDatabasePath(root: string, configured?: string) {
  const selection = configured?.trim().replaceAll('\\', '/');
  if (selection === 'dev.db' || selection === 'prisma/dev.db' || selection === '.data/app.db') {
    throw new Error('CV Studio cannot use the TeachMe application database.');
  }
  if (selection && selection !== '.data/career.db' && selection !== '.integration-data/career.db') {
    throw new Error('CV Studio storage must stay inside its approved TeachMe data directory.');
  }
  return selection === '.integration-data/career.db'
    ? path.join(root, '.integration-data', 'career.db')
    : path.join(root, '.data', 'career.db');
}

/** Creates the folder that holds the career database and refuses symbolic links. */
export function prepareCareerFolder(candidate: string): void {
  const directory = path.dirname(candidate);
  mkdirSync(directory, { recursive: true });
  if (lstatSync(directory).isSymbolicLink() || (existsSync(candidate) && lstatSync(candidate).isSymbolicLink())) {
    throw new Error('CV Studio storage cannot use symbolic links.');
  }
}

export function careerDatabaseUrl() {
  const root = process.cwd();
  const candidate = resolveCareerDatabasePath(root, process.env.CV_STUDIO_DATABASE_PATH);
  prepareCareerFolder(candidate);
  return pathToFileURL(candidate).href;
}
