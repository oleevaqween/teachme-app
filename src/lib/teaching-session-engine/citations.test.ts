import { describe, expect, it } from 'vitest';
import { isWebAddress, messageChips, parseCitations } from './citations';

describe('web addresses', () => {
  it('accepts only real http and https addresses', () => {
    expect(isWebAddress('https://example.com/raci')).toBe(true);
    expect(isWebAddress('http://example.com')).toBe(true);
    expect(isWebAddress('Wikipedia')).toBe(false);
    expect(isWebAddress('javascript:alert(1)')).toBe(false);
    expect(isWebAddress('ftp://example.com')).toBe(false);
    expect(isWebAddress('https://')).toBe(false);
    expect(isWebAddress(undefined)).toBe(false);
  });
});

describe('citation markers', () => {
  it('gives inline web citations no address, so their name is never a link', () => {
    expect(parseCitations('As stated [Web: Wikipedia] here.').inlineSources).toEqual([{ type: 'web', name: 'Wikipedia' }]);
  });

  it('removes [General Knowledge] from the text and reports it', () => {
    const parsed = parseCitations('A RACI chart has four roles [General Knowledge]. More [general knowledge] here.');
    expect(parsed.cleanedContent).toBe('A RACI chart has four roles. More here.');
    expect(parsed.generalKnowledge).toBe(true);
    expect(parseCitations('Plain text.').generalKnowledge).toBe(false);
  });
});

describe('message chips', () => {
  it('keeps the saved source (with its address) over the same inline citation', () => {
    const { content, chips } = messageChips('See [Web: RACI guide] and [Document: plan.pdf].', [
      { type: 'web', name: 'RACI guide', url: 'https://example.com/raci' },
    ]);
    expect(content).toBe('See and.');
    expect(chips).toEqual([
      { kind: 'web', name: 'RACI guide', url: 'https://example.com/raci' },
      { kind: 'document', name: 'plan.pdf' },
    ]);
  });

  it('drops a saved web address that is not http or https', () => {
    expect(messageChips('Text', [{ type: 'web', name: 'Odd', url: 'Odd' }]).chips).toEqual([{ kind: 'web', name: 'Odd' }]);
  });

  it('adds one General knowledge chip, last', () => {
    const { chips } = messageChips('Fact [General Knowledge] and another [General Knowledge].', [{ type: 'document', name: 'a.pdf' }]);
    expect(chips).toEqual([{ kind: 'document', name: 'a.pdf' }, { kind: 'general' }]);
  });
});
