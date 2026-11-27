import { describe, expect, it } from 'vitest';
import { DEFAULT_ZOOM, MIN_HEIGHT, MIN_WIDTH, ZOOM_STEPS, defaultBox, fitBox, moveBox, parseBox, parseZoom, resizeBox, resizeFromEdge, stepZoom } from './preview-window';

const view = { width: 1440, height: 900 };

describe('floating preview window box', () => {
  it('starts where the old floating panel sat', () => {
    expect(defaultBox(view)).toEqual({ x: 1440 - 460 - 20, y: 80, width: 460, height: 900 - 100 });
  });

  it('fits a small screen', () => {
    const box = defaultBox({ width: 400, height: 500 });
    expect(box.x).toBeGreaterThanOrEqual(8);
    expect(box.x + box.width).toBeLessThanOrEqual(400 - 8);
    expect(box.y + box.height).toBeLessThanOrEqual(500 - 8);
  });

  it('parses only a complete box of finite numbers', () => {
    expect(parseBox('{"x":10,"y":20,"width":400,"height":500}')).toEqual({ x: 10, y: 20, width: 400, height: 500 });
    expect(parseBox(null)).toBeNull();
    expect(parseBox('not json')).toBeNull();
    expect(parseBox('{"x":10,"y":20,"width":400}')).toBeNull();
    expect(parseBox('{"x":"10","y":20,"width":400,"height":500}')).toBeNull();
    expect(parseBox('{"x":1e999,"y":20,"width":400,"height":500}')).toBeNull();
    expect(parseBox('[1,2,3,4]')).toBeNull();
  });

  it('keeps the window fully on screen and at least the minimum size', () => {
    expect(fitBox({ x: 5000, y: -50, width: 400, height: 500 }, view)).toEqual({ x: 1440 - 400 - 8, y: 8, width: 400, height: 500 });
    expect(fitBox({ x: 100, y: 100, width: 10, height: 10 }, view)).toEqual({ x: 100, y: 100, width: MIN_WIDTH, height: MIN_HEIGHT });
    expect(fitBox({ x: 0, y: 0, width: 5000, height: 5000 }, view)).toEqual({ x: 8, y: 8, width: 1440 - 16, height: 900 - 16 });
  });

  it('pulls the window back when the browser shrinks', () => {
    const box = fitBox({ x: 1000, y: 300, width: 400, height: 500 }, { width: 800, height: 600 });
    expect(box.x + box.width).toBeLessThanOrEqual(800 - 8);
    expect(box.y + box.height).toBeLessThanOrEqual(600 - 8);
    expect(box.x).toBeGreaterThanOrEqual(8);
  });

  it('moves by an offset and stays on screen', () => {
    expect(moveBox({ x: 100, y: 100, width: 400, height: 500 }, -20, 40, view)).toEqual({ x: 80, y: 140, width: 400, height: 500 });
    expect(moveBox({ x: 100, y: 100, width: 400, height: 500 }, -500, -500, view)).toEqual({ x: 8, y: 8, width: 400, height: 500 });
  });

  it('resizes from the bottom-right corner without moving the top-left corner', () => {
    expect(resizeBox({ x: 100, y: 100, width: 400, height: 500 }, 60, -40, view)).toEqual({ x: 100, y: 100, width: 460, height: 460 });
    expect(resizeBox({ x: 100, y: 100, width: 400, height: 500 }, 5000, 5000, view)).toEqual({ x: 100, y: 100, width: 1440 - 8 - 100, height: 900 - 8 - 100 });
    expect(resizeBox({ x: 100, y: 100, width: 400, height: 500 }, -5000, -5000, view)).toEqual({ x: 100, y: 100, width: MIN_WIDTH, height: MIN_HEIGHT });
  });

  const start = { x: 300, y: 200, width: 400, height: 500 };

  it('resizes from the right or bottom edge without moving the window', () => {
    expect(resizeFromEdge(start, 'e', 50, 999, view)).toEqual({ x: 300, y: 200, width: 450, height: 500 });
    expect(resizeFromEdge(start, 's', 999, -60, view)).toEqual({ x: 300, y: 200, width: 400, height: 440 });
  });

  it('resizes from the left or top edge while the opposite edge stays put', () => {
    expect(resizeFromEdge(start, 'w', -100, 0, view)).toEqual({ x: 200, y: 200, width: 500, height: 500 });
    expect(resizeFromEdge(start, 'w', 30, 0, view)).toEqual({ x: 330, y: 200, width: 370, height: 500 });
    expect(resizeFromEdge(start, 'n', 0, -150, view)).toEqual({ x: 300, y: 50, width: 400, height: 650 });
  });

  it('resizes from any corner by combining its two edges', () => {
    expect(resizeFromEdge(start, 'nw', -50, -50, view)).toEqual({ x: 250, y: 150, width: 450, height: 550 });
    expect(resizeFromEdge(start, 'ne', 50, -50, view)).toEqual({ x: 300, y: 150, width: 450, height: 550 });
    expect(resizeFromEdge(start, 'sw', -50, 50, view)).toEqual({ x: 250, y: 200, width: 450, height: 550 });
    expect(resizeFromEdge(start, 'se', 60, -40, view)).toEqual(resizeBox(start, 60, -40, view));
  });

  it('stays below the navigation bar, so its top edge and buttons are never covered', () => {
    const withBar = { width: 1440, height: 900, top: 57 };
    expect(moveBox(start, 0, -5000, withBar)).toEqual({ x: 300, y: 57 + 8, width: 400, height: 500 });
    expect(resizeFromEdge(start, 'n', 0, -5000, withBar)).toEqual({ x: 300, y: 57 + 8, width: 400, height: 700 - 57 - 8 });
    expect(resizeFromEdge(start, 'nw', -40, -5000, withBar)).toEqual({ x: 260, y: 57 + 8, width: 440, height: 700 - 57 - 8 });
    expect(fitBox({ x: 0, y: 0, width: 5000, height: 5000 }, withBar)).toEqual({ x: 8, y: 57 + 8, width: 1440 - 16, height: 900 - 57 - 16 });
    expect(defaultBox(withBar).y).toBe(80);
  });

  it('stops at the minimum size and at the screen edge', () => {
    // Shrinking from the left: the right edge (700) stays, so x stops at 700 - MIN_WIDTH.
    expect(resizeFromEdge(start, 'w', 5000, 0, view)).toEqual({ x: 700 - MIN_WIDTH, y: 200, width: MIN_WIDTH, height: 500 });
    // Growing from the left or top stops 8px from the screen edge.
    expect(resizeFromEdge(start, 'w', -5000, 0, view)).toEqual({ x: 8, y: 200, width: 700 - 8, height: 500 });
    expect(resizeFromEdge(start, 'n', 0, -5000, view)).toEqual({ x: 300, y: 8, width: 400, height: 700 - 8 });
    expect(resizeFromEdge(start, 'n', 0, 5000, view)).toEqual({ x: 300, y: 700 - MIN_HEIGHT, width: 400, height: MIN_HEIGHT });
    expect(resizeFromEdge(start, 'e', 5000, 0, view)).toEqual({ x: 300, y: 200, width: 1440 - 8 - 300, height: 500 });
  });
});

describe('preview zoom', () => {
  it('defaults to 100% and parses only known levels', () => {
    expect(DEFAULT_ZOOM).toBe(100);
    expect(parseZoom('150')).toBe(150);
    expect(parseZoom(null)).toBe(100);
    expect(parseZoom('120')).toBe(100);
    expect(parseZoom('big')).toBe(100);
  });

  it('steps through the levels and stops at the ends', () => {
    expect(ZOOM_STEPS).toEqual([50, 67, 75, 90, 100, 110, 125, 150, 175, 200]);
    expect(stepZoom(100, 1)).toBe(110);
    expect(stepZoom(100, -1)).toBe(90);
    expect(stepZoom(200, 1)).toBe(200);
    expect(stepZoom(50, -1)).toBe(50);
  });
});
