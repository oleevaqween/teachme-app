import { describe, expect, it } from 'vitest';
import { activeNavHref } from './navigation';

describe('activeNavHref', () => {
  it('highlights only the most specific section', () => {
    expect(activeNavHref('/interview/archive')).toBe('/interview/archive');
    expect(activeNavHref('/interview/mock')).toBe('/interview');
    expect(activeNavHref('/teach-me/journey/abc')).toBe('/teach-me');
    expect(activeNavHref('/applications')).toBe('/applications');
  });

  it('matches Home only on the home page', () => {
    expect(activeNavHref('/')).toBe('/');
    expect(activeNavHref('/cv-studio')).toBe('/cv-studio');
  });

  it('does not treat a shared prefix as a match', () => {
    expect(activeNavHref('/interviews')).toBeUndefined();
  });
});
