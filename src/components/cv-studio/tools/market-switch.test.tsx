import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { makeWorkspace } from '../useWorkspace';
import { MarketSwitch } from './MarketSwitch';

describe('market switch', () => {
  it('offers the three markets with the chosen one checked', () => {
    const html = renderToStaticMarkup(<MarketSwitch value="nigeria" onChange={() => {}} />);
    for (const label of ['International / UK', 'Nigeria', 'US', 'Applying in']) expect(html).toContain(label);
    expect(html).toMatch(/<input[^>]*value="nigeria"[^>]*checked=""|<input[^>]*checked=""[^>]*value="nigeria"/);
    expect(html).toContain('Sets the spelling, the length target and advice on personal details.');
  });
  it('describes the fieldset with the hint', () => {
    const html = renderToStaticMarkup(<MarketSwitch value="us" onChange={() => {}} />);
    const describedBy = html.match(/<fieldset[^>]*aria-describedby="([^"]+)"/)?.[1];
    expect(describedBy).toBeTruthy();
    expect(html).toContain(`<small id="${describedBy}">`);
  });
  it('is copied to applications made from a master that has one, and absent otherwise', () => {
    const master = { ...makeWorkspace('Master CV'), market: 'us' as const };
    expect(makeWorkspace('Application', 'application', master).market).toBe('us');
    expect(makeWorkspace('Master CV')).not.toHaveProperty('market');
    expect(makeWorkspace('Application', 'application', makeWorkspace('Master CV'))).not.toHaveProperty('market');
  });
});
