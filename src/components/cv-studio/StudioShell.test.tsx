import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Workspace } from '@/lib/cv-studio/schema';
import { makeWorkspace } from './useWorkspace';
import { StudioShell } from './StudioShell';
import { PreviewPane } from './PreviewPane';
import type { StudioController } from './useStudioController';

const noop = () => {};

function controller(w: Workspace): StudioController {
  return {
    state: { loaded: true, status: 'Saved', canUndo: false, undo: noop, recovery: null, clearRecovery: noop },
    w, workspaces: [w], change: noop, save: noop, create: noop, select: noop, error: '', setError: noop, tab: 'profile', setTab: noop,
    busy: '', aiBusy: false, importOpen: false, setImportOpen: noop, deleteTarget: null, setDeleteTarget: noop,
    evidenceOpen: false, setEvidenceOpen: noop, setImported: noop, notice: '', abort: { current: null }, pending: 0, guide: null,
    draft: null, update: noop, run: noop, prepare: noop, loadVersions: noop, viewingDraft: false, currentPreview: false,
    preview: null, setPreview: noop, exportFile: noop,
  } as unknown as StudioController;
}

const count = (html: string, pattern: RegExp) => (html.match(pattern) ?? []).length;
const topBar = (html: string) => html.slice(html.indexOf('class="studio-topbar"'), html.indexOf('class="studio-main"'));
const heading = (html: string) => html.slice(html.indexOf('class="editor-heading"'), html.indexOf('class="studio-content"'));

describe('CV Studio top bar and editor heading', () => {
  const master = makeWorkspace('Master CV');
  const application = makeWorkspace('Acme application', 'application', master);

  it('has exactly one main (gold) button in the top bar: Export PDF', () => {
    const bar = topBar(renderToStaticMarkup(<StudioShell c={controller(application)} />));
    expect(count(bar, /class="studio-button"/g)).toBe(1);
    expect(bar).toMatch(/class="studio-button"[^>]*>Export PDF</);
    expect(bar).toMatch(/class="studio-button secondary"[^>]*>(<svg[\s\S]*?<\/svg>)? ?Application</);
  });

  it('keeps delete out of the top bar and puts a labelled Delete button in the application heading', () => {
    const html = renderToStaticMarkup(<StudioShell c={controller(application)} />);
    expect(topBar(html)).not.toMatch(/Delete/);
    expect(heading(html)).toMatch(/aria-label="Delete this application"[^>]*>[\s\S]*?Delete<\/button>/);
  });

  it('shows no Delete button for the master CV', () => {
    expect(heading(renderToStaticMarkup(<StudioShell c={controller(master)} />))).not.toMatch(/Delete/);
  });

  it('offers one preview toggle, Float preview, while docked', () => {
    const bar = topBar(renderToStaticMarkup(<StudioShell c={controller(application)} />));
    expect(bar).toMatch(/Float preview/);
    expect(bar).not.toMatch(/Hide preview|Keep it docked/);
  });
});

describe('CV preview pane', () => {
  const w = makeWorkspace('Master CV');

  it('docked: shows the zoom bar and no move or resize handles', () => {
    const html = renderToStaticMarkup(<PreviewPane c={controller(w)} w={w} highlight="profile" floating={false} onDock={noop} />);
    expect(html).toMatch(/aria-label="Zoom out"/);
    expect(html).toMatch(/aria-label="Zoom in"/);
    expect(html).toMatch(/>100%</);
    expect(html).toMatch(/>Fit</);
    expect(html).not.toMatch(/Move preview|Resize preview|Dock preview|Close preview/);
  });

  it('floating: opens straight away with move, resize, dock and close controls', () => {
    const html = renderToStaticMarkup(<PreviewPane c={controller(w)} w={w} highlight="profile" floating onDock={noop} />);
    expect(html).toMatch(/data-floating="true"/);
    expect(html).toMatch(/aria-label="Move preview"/);
    expect(html).toMatch(/aria-label="Resize preview"/);
    expect(html).toMatch(/Dock preview/);
    expect(html).toMatch(/aria-label="Close preview"/);
    expect(html).toMatch(/aria-label="Zoom in"/);
    expect(html).not.toMatch(/Keep it docked/);
  });
});
