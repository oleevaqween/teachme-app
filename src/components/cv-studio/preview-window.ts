/** Where the floating preview window sits and how far the preview is zoomed; pure helpers, no browser access. */

export type Box = { x: number; y: number; width: number; height: number };
/** The browser window; `top` is the height kept clear at the top for the sticky navigation bar. */
export type Viewport = { width: number; height: number; top?: number };

export const PREVIEW_WINDOW_KEY = 'teachme-cv-preview-window';
export const PREVIEW_ZOOM_KEY = 'teachme-cv-preview-zoom';
export const MIN_WIDTH = 320;
export const MIN_HEIGHT = 300;
/** Gap kept between the window and the edge of the browser. */
const EDGE = 8;

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), Math.max(low, high));

/** The highest the window's top edge may go: just below the navigation bar. */
const topLimit = (view: Viewport) => (view.top ?? 0) + EDGE;

/** Keeps the window at least the minimum size (or the screen, if smaller) and fully on screen. */
export function fitBox(box: Box, view: Viewport): Box {
  const width = clamp(box.width, Math.min(MIN_WIDTH, view.width - 2 * EDGE), view.width - 2 * EDGE);
  const height = clamp(box.height, Math.min(MIN_HEIGHT, view.height - topLimit(view) - EDGE), view.height - topLimit(view) - EDGE);
  return {
    x: clamp(box.x, EDGE, view.width - width - EDGE),
    y: clamp(box.y, topLimit(view), view.height - height - EDGE),
    width,
    height,
  };
}

/** The spot the floating panel used before it could move: 20px from the right, 80px from the top, 460px wide. */
export function defaultBox(view: Viewport): Box {
  const width = Math.min(460, view.width - 40);
  return fitBox({ x: view.width - width - 20, y: 80, width, height: view.height - 100 }, view);
}

/** A saved box, or null when the value is missing, broken or incomplete. */
export function parseBox(raw: string | null): Box | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const { x, y, width, height } = value as Record<string, unknown>;
    const numbers = [x, y, width, height];
    if (!numbers.every(n => typeof n === 'number' && Number.isFinite(n))) return null;
    return { x: x as number, y: y as number, width: width as number, height: height as number };
  } catch {
    return null;
  }
}

export function moveBox(box: Box, dx: number, dy: number, view: Viewport): Box {
  return fitBox({ ...box, x: box.x + dx, y: box.y + dy }, view);
}

/** Resizing drags the bottom-right corner, so the top-left corner stays put while there is room. */
export function resizeBox(box: Box, dw: number, dh: number, view: Viewport): Box {
  return fitBox({
    ...box,
    width: clamp(box.width + dw, MIN_WIDTH, view.width - EDGE - box.x),
    height: clamp(box.height + dh, MIN_HEIGHT, view.height - EDGE - box.y),
  }, view);
}

/** An edge or corner of the floating window, by compass point. */
export type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export const EDGES: readonly Edge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

/** Resizing from any edge or corner: the dragged edges follow the pointer and the opposite edges stay put. */
export function resizeFromEdge(box: Box, edge: Edge, dx: number, dy: number, view: Viewport): Box {
  let { x, y, width, height } = box;
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  if (edge.includes('e')) width = clamp(box.width + dx, MIN_WIDTH, view.width - EDGE - box.x);
  if (edge.includes('s')) height = clamp(box.height + dy, MIN_HEIGHT, view.height - EDGE - box.y);
  if (edge.includes('w')) {
    x = clamp(box.x + dx, EDGE, right - MIN_WIDTH);
    width = right - x;
  }
  if (edge.includes('n')) {
    y = clamp(box.y + dy, topLimit(view), bottom - MIN_HEIGHT);
    height = bottom - y;
  }
  return fitBox({ x, y, width, height }, view);
}

/** Zoom levels in percent; 100 means the page fills the preview's width. */
export const ZOOM_STEPS = [50, 67, 75, 90, 100, 110, 125, 150, 175, 200] as const;
export const DEFAULT_ZOOM = 100;

export function parseZoom(raw: string | null): number {
  const value = Number(raw);
  return (ZOOM_STEPS as readonly number[]).includes(value) ? value : DEFAULT_ZOOM;
}

/** The next level up (1) or down (-1), staying at the ends. */
export function stepZoom(current: number, direction: 1 | -1): number {
  const steps = ZOOM_STEPS as readonly number[];
  const index = steps.indexOf(parseZoom(String(current)));
  return steps[clamp(index + direction, 0, steps.length - 1)];
}

/**
 * Whether Escape pressed outside the floating preview should close it: not when another control already used
 * the key, not while typing in a field (Escape there belongs to the field), and not while a dialog is open.
 */
export function escapeClosesPreview(event: { key: string; defaultPrevented: boolean; editable: boolean; modalOpen: boolean }): boolean {
  return event.key === 'Escape' && !event.defaultPrevented && !event.editable && !event.modalOpen;
}
