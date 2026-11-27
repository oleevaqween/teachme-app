import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Workspace } from '@/lib/cv-studio/schema';
import { EvidenceReturnBanner } from './EvidenceReturnBanner';
import { StudioShell } from './StudioShell';
import { makeWorkspace } from './useWorkspace';
import type { StudioController } from './useStudioController';

const noop = () => {};

function controller(w: Workspace, extra: Partial<StudioController>): StudioController {
  return {
    state: { loaded: true, status: 'Saved', canUndo: false, undo: noop, recovery: null, clearRecovery: noop },
    w, workspaces: [w], change: noop, save: noop, create: noop, select: noop, error: '', setError: noop, tab: 'profile', setTab: noop,
    busy: '', aiBusy: false, importOpen: false, setImportOpen: noop, deleteTarget: null, setDeleteTarget: noop,
    evidenceOpen: false, setEvidenceOpen: noop, setImported: noop, notice: '', abort: { current: null }, pending: 0, guide: null,
    draft: null, update: noop, run: noop, prepare: noop, loadVersions: noop, viewingDraft: false, currentPreview: false,
    preview: null, setPreview: noop, exportFile: noop,
    ...extra,
  } as unknown as StudioController;
}

describe('Teach Me evidence banner', () => {
  it('shows the fixed wording and button, and adds nothing just by showing', () => {
    const onAdd = vi.fn();
    const onDismiss = vi.fn();
    const html = renderToStaticMarkup(<EvidenceReturnBanner topic="Power BI" disabled={false} onAdd={onAdd} onDismiss={onDismiss} />);
    expect(html).toContain('You finished a Teach Me journey on Power BI. Add evidence only for what you have actually done.');
    expect(html).toMatch(/<button[^>]*>Add evidence for Power BI<\/button>/);
    expect(html).toContain('aria-label="Dismiss"');
    expect(html).toContain('role="status"');
    expect(onAdd).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('disables the button while CV Studio is busy', () => {
    expect(renderToStaticMarkup(<EvidenceReturnBanner topic="Power BI" disabled onAdd={noop} onDismiss={noop} />)).toMatch(/<button[^>]*disabled=""[^>]*>Add evidence for Power BI/);
  });

  it('appears in CV Studio only while the controller has a topic for the open application', () => {
    const application = makeWorkspace('Acme application', 'application', makeWorkspace('Master CV'));
    const shown = renderToStaticMarkup(<StudioShell c={controller(application, { evidenceTopic: 'Power BI' })} />);
    expect(shown).toContain('Add evidence for Power BI');
    const hidden = renderToStaticMarkup(<StudioShell c={controller(application, { evidenceTopic: null })} />);
    expect(hidden).not.toContain('Teach Me journey');
  });
});
