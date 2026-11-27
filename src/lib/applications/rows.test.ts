import { describe, expect, it } from 'vitest';
import type { Analysis, SavedWorkspace } from '@/lib/cv-studio/schema';
import { fixture } from '@/lib/cv-studio/test-fixture';
import { buildRows } from './rows';
import { blankApplicationInput, type SavedApplication } from './schema';

const workspace = (id: string, kind: 'master' | 'application', name: string, analysis: Analysis | null = null): SavedWorkspace => ({
  ...fixture(), id, kind, name, analysis, parentId: kind === 'master' ? null : 'master', revision: 1, updatedAt: '2026-11-10T08:00:00.000Z',
});
const entry = (id: string, workspaceId: string | null, company: string): SavedApplication => ({
  ...blankApplicationInput({ company, role: 'PM', workspaceId }),
  id, history: [], createdAt: '2026-11-12T08:00:00.000Z', revision: 3, updatedAt: '2026-11-14T08:00:00.000Z',
});

describe('buildRows', () => {
  const master = workspace('master', 'master', 'Master CV');
  const analysed = workspace('cv-1', 'application', 'New application', { role: 'Delivery Lead', company: 'Globex' } as Analysis);
  const plain = workspace('cv-2', 'application', 'Bank PM role');

  it('shows unlinked CV Studio applications as virtual Preparing rows, never masters', () => {
    const { rows } = buildRows([], [master, analysed, plain]);
    expect(rows.map(r => r.key)).toEqual(['cv:cv-1', 'cv:cv-2']);
    expect(rows[0]).toMatchObject({ virtual: true, entry: null, workspaceId: 'cv-1', cvName: 'New application', updatedAt: '2026-11-10T08:00:00.000Z' });
    expect(rows[0].draft).toMatchObject({ company: 'Globex', role: 'Delivery Lead', status: 'preparing', workspaceId: 'cv-1' });
    expect(rows[1].draft).toMatchObject({ company: '', role: 'Bank PM role' });
  });

  it('replaces the virtual row once an entry links that CV', () => {
    const { rows } = buildRows([entry('e1', 'cv-1', 'Globex Ltd')], [master, analysed, plain]);
    expect(rows.map(r => r.key)).toEqual(['e1', 'cv:cv-2']);
    expect(rows[0]).toMatchObject({ virtual: false, cvName: 'New application', cvMissing: false, updatedAt: '2026-11-14T08:00:00.000Z' });
  });

  it('flags entries whose linked CV was deleted', () => {
    const { rows } = buildRows([entry('e1', 'gone', 'Initech')], [master]);
    expect(rows[0]).toMatchObject({ cvMissing: true, cvName: null, workspaceId: 'gone' });
  });

  it('offers only application CVs that no entry links yet', () => {
    const { cvOptions } = buildRows([entry('e1', 'cv-1', 'Globex')], [master, analysed, plain]);
    expect(cvOptions).toEqual([{ id: 'cv-2', name: 'Bank PM role' }]);
  });

  it('passes the linked CV market on, for question order', () => {
    const us = { ...analysed, market: 'us' as const };
    const ng = { ...plain, market: 'nigeria' as const };
    const { rows, cvOptions } = buildRows([entry('e1', 'cv-1', 'Globex')], [master, us, ng]);
    expect(rows[0].market).toBe('us');
    expect(rows[1].market).toBe('nigeria');
    expect(cvOptions).toEqual([{ id: 'cv-2', name: 'Bank PM role', market: 'nigeria' }]);
    expect(buildRows([], [plain]).rows[0]).not.toHaveProperty('market');
  });
});
