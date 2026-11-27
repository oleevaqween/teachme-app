import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

import { Button } from './button';
import { Navigation } from '../navigation';

describe('Button type scale', () => {
  it('default uses text-small', () => {
    expect(renderToStaticMarkup(<Button>Go</Button>)).toContain('text-small');
  });
  it('xs and sm use text-caption', () => {
    const xs = renderToStaticMarkup(<Button size="xs">Go</Button>);
    const sm = renderToStaticMarkup(<Button size="sm">Go</Button>);
    expect(xs).toContain('text-caption');
    expect(sm).toContain('text-caption');
    expect(sm).not.toContain('text-[0.8rem]');
  });
  it('a className size overrides the Button size through cn', () => {
    const html = renderToStaticMarkup(<Button className="text-lead">Go</Button>);
    expect(html).toContain('text-lead');
    expect(html).not.toContain('text-small');
  });
});

describe('Navigation type scale', () => {
  it('uses no stock size classes', () => {
    const html = renderToStaticMarkup(<Navigation />);
    expect(html).not.toMatch(/\btext-(xs|sm|base|lg|xl)\b/);
    expect(html).toContain('text-small');
    expect(html).toContain('text-lead');
  });
  it('source has no stock size classes', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/navigation.tsx'), 'utf8');
    expect(src).not.toMatch(/\btext-(xs|sm|base|lg|xl)\b/);
  });
});
