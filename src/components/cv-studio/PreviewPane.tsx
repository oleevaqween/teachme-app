'use client';
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Download, Eye, GripHorizontal, MoveDiagonal2, PanelRight, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { Workspace } from '@/lib/cv-studio/schema';
import { ExactPdfPreview } from './ExactPdfPreview';
import { ResumePreview } from './ResumePreview';
import { DEFAULT_ZOOM, PREVIEW_WINDOW_KEY, PREVIEW_ZOOM_KEY, ZOOM_STEPS, EDGES, defaultBox, escapeClosesPreview, fitBox, moveBox, parseBox, parseZoom, resizeBox, resizeFromEdge, stepZoom, type Box, type Edge } from './preview-window';
import { useRememberedText, useViewport } from './studio-prefs';
import type { StudioController } from './useStudioController';

/** Arrow keys move or resize the floating window by this many pixels; Shift moves further. */
const KEY_STEP = 20;
const KEY_STEP_LARGE = 80;

function arrowOffset(e: KeyboardEvent): [number, number] | null {
  const step = e.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
  switch (e.key) {
    case 'ArrowLeft': return [-step, 0];
    case 'ArrowRight': return [step, 0];
    case 'ArrowUp': return [0, -step];
    case 'ArrowDown': return [0, step];
    default: return null;
  }
}

/** The sticky navigation bar's height, so the floating window never slides underneath it (0 before the page exists). */
function navigationHeight(): number {
  if (typeof document === 'undefined') return 0;
  const bar = document.querySelector('header.sticky');
  return bar ? Math.max(0, Math.round(bar.getBoundingClientRect().bottom)) : 0;
}

export function PreviewPane({ c, w, highlight, floating, onDock }: {
  c: StudioController;
  w: Workspace;
  highlight: string;
  floating: boolean;
  onDock: () => void;
}) {
  const { busy, viewingDraft, draft, currentPreview, preview, setPreview, exportFile } = c;
  const [open, setOpen] = useState(true);
  const [zoomText, setZoomText] = useRememberedText(PREVIEW_ZOOM_KEY);
  const zoom = parseZoom(zoomText);
  const [boxText, setBoxText] = useRememberedText(PREVIEW_WINDOW_KEY);
  const screenSize = useViewport();
  const viewport = screenSize ? { ...screenSize, top: navigationHeight() } : null;
  const [dragging, setDragging] = useState<Box | null>(null);
  const saved = parseBox(boxText);
  const box = dragging ?? (viewport ? (saved ? fitBox(saved, viewport) : defaultBox(viewport)) : null);
  const canvas = useRef<HTMLDivElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const grip = useRef<HTMLButtonElement>(null);
  const windowRef = useRef<HTMLElement>(null);
  const focusAfterToggle = useRef(false);
  const [fitWidth, setFitWidth] = useState(0);

  // Closing hands focus to the Preview button and reopening hands it back to the window, so keyboard users are never dropped.
  useEffect(() => {
    if (!focusAfterToggle.current) return;
    focusAfterToggle.current = false;
    (open ? grip.current : launcher.current)?.focus();
  }, [open]);

  function toggleOpen(next: boolean) {
    focusAfterToggle.current = true;
    setOpen(next);
  }

  // Escape closes the floating preview from anywhere on the page (inside it, its own handler does this and moves
  // focus to the Preview button). Outside it, focus stays where it is.
  useEffect(() => {
    if (!floating || !open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && windowRef.current?.contains(target)) return;
      const editable = !!target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      const modalOpen = !!document.querySelector('[aria-modal="true"], dialog[open]');
      if (escapeClosesPreview({ key: event.key, defaultPrevented: event.defaultPrevented, editable, modalOpen })) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [floating, open]);

  // Zooming scales the page drawn at the width it has at 100%, so the text never reflows.
  useEffect(() => {
    const host = canvas.current;
    if (!host) return;
    const measure = () => {
      const style = getComputedStyle(host);
      setFitWidth(host.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, [open]);

  if (floating && !open) {
    return <button type="button" ref={launcher} className="studio-button preview-launch" onClick={() => toggleOpen(true)}><Eye size={16} aria-hidden="true" /> Preview</button>;
  }

  function startDrag(e: ReactPointerEvent<HTMLElement>, mode: 'move' | Edge) {
    if (!box || e.button !== 0) return;
    const control = (e.target as HTMLElement).closest('button, a, input, select, textarea');
    if (mode === 'move' && control && !control.classList.contains('preview-grip')) return;
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const start = { x: e.clientX, y: e.clientY, box };
    let latest: Box | null = null;
    const onMove = (event: PointerEvent) => {
      const view = { width: window.innerWidth, height: window.innerHeight, top: navigationHeight() };
      const dx = event.clientX - start.x, dy = event.clientY - start.y;
      latest = mode === 'move' ? moveBox(start.box, dx, dy, view) : resizeFromEdge(start.box, mode, dx, dy, view);
      setDragging(latest);
    };
    const onEnd = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onEnd);
      handle.removeEventListener('pointercancel', onEnd);
      // A click without movement saves nothing, so a size squeezed by a smaller browser window is not stored over the user's own.
      if (latest) setBoxText(JSON.stringify(latest));
      setDragging(null);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onEnd);
    handle.addEventListener('pointercancel', onEnd);
  }

  function nudge(e: KeyboardEvent, mode: 'move' | 'resize') {
    const offset = arrowOffset(e);
    if (!offset || !box || !viewport) return;
    e.preventDefault();
    setBoxText(JSON.stringify(mode === 'move' ? moveBox(box, ...offset, viewport) : resizeBox(box, ...offset, viewport)));
  }

  const windowStyle: CSSProperties | undefined = floating && box ? { left: box.x, top: box.y, width: box.width, height: box.height } : undefined;
  const zoomStyle: CSSProperties | undefined = zoom !== DEFAULT_ZOOM && fitWidth > 0 ? { width: fitWidth, zoom: String(zoom / 100) } : undefined;

  return (
    <aside ref={windowRef} className="studio-preview" data-floating={floating || undefined} data-dragging={dragging ? true : undefined} style={windowStyle} aria-label="CV preview"
      onKeyDown={floating ? e => { if (e.key === 'Escape') { e.stopPropagation(); toggleOpen(false); } } : undefined}>
      <div className="preview-top" onPointerDown={floating ? e => startDrag(e, 'move') : undefined}>
        <span>
          {floating && <button type="button" ref={grip} className="icon-button preview-grip" aria-label="Move preview" aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight" title="Drag to move, or use the arrow keys" onKeyDown={e => nudge(e, 'move')}><GripHorizontal size={16} aria-hidden="true" /></button>}
          <span className="preview-dot" /> {viewingDraft ? 'PROPOSED CV · NOT APPLIED' : 'CURRENT CV'}
        </span>
        <div className="preview-actions">
          <button className="studio-button secondary" disabled={!!busy || viewingDraft} onClick={() => currentPreview ? setPreview(null) : void exportFile('pdf', 'cv', true)}>{currentPreview && !viewingDraft ? 'Back to live layout' : 'Exact PDF'}</button>
          {floating && <>
            <button type="button" className="studio-button secondary" onClick={onDock}><PanelRight size={14} aria-hidden="true" /> Dock preview</button>
            <button type="button" className="icon-button" aria-label="Close preview" title="Close (Esc); the Preview button brings it back" onClick={() => toggleOpen(false)}><X size={16} aria-hidden="true" /></button>
          </>}
        </div>
      </div>
      <div className="preview-zoom" role="group" aria-label="Preview zoom">
        <button type="button" className="icon-button" aria-label="Zoom out" disabled={zoom === ZOOM_STEPS[0]} onClick={() => setZoomText(String(stepZoom(zoom, -1)))}><ZoomOut size={16} aria-hidden="true" /></button>
        <output aria-live="polite">{zoom}%</output>
        <button type="button" className="icon-button" aria-label="Zoom in" disabled={zoom === ZOOM_STEPS[ZOOM_STEPS.length - 1]} onClick={() => setZoomText(String(stepZoom(zoom, 1)))}><ZoomIn size={16} aria-hidden="true" /></button>
        <button type="button" className="studio-button secondary" title="Fit the page to the preview's width" disabled={zoom === DEFAULT_ZOOM} onClick={() => setZoomText(String(DEFAULT_ZOOM))}>Fit</button>
      </div>
      <div className="preview-canvas" ref={canvas}>
        <div className="preview-zoom-frame" style={zoomStyle}>
          {viewingDraft ? <ResumePreview workspace={{ ...w, resume: draft!.resume }} highlight={highlight} /> : currentPreview ? <ExactPdfPreview key={preview!.url} url={preview!.url} /> : <ResumePreview workspace={w} highlight={highlight} />}
        </div>
      </div>
      <div className="preview-footer"><p>{viewingDraft ? 'Review and apply the tailored edits before exporting this draft.' : currentPreview ? 'The actual export, with real page breaks.' : 'Live layout guide. Exact PDF shows final pagination.'}</p><div className="export-buttons"><button className="studio-button" disabled={!!busy || viewingDraft} onClick={() => void exportFile('pdf')}><Download size={16} /> PDF</button><button className="studio-button secondary" disabled={!!busy || viewingDraft} onClick={() => void exportFile('docx')}>Word</button><button className="studio-button secondary" disabled={!!busy || viewingDraft} onClick={() => void exportFile('txt')}>Text</button></div><small>Exports are checked for text loss and reading order. No universal ATS guarantee.</small></div>
      {/* Every edge and corner resizes, like a normal window; the bottom-right corner is also a button for keyboard users. */}
      {floating && EDGES.filter(edge => edge !== 'se').map(edge => <div key={edge} className={`preview-edge preview-edge-${edge}`} aria-hidden="true" onPointerDown={e => startDrag(e, edge)} />)}
      {floating && <button type="button" className="preview-resize" aria-label="Resize preview" aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight" title="Drag any edge or corner to resize, or use the arrow keys here" onPointerDown={e => startDrag(e, 'se')} onKeyDown={e => nudge(e, 'resize')}><MoveDiagonal2 size={16} aria-hidden="true" /></button>}
    </aside>
  );
}
