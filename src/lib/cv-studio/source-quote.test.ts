import { describe, expect, it } from 'vitest';
import { sourceQuote } from './source-quote';
describe('Original source quotation recovery', () => {
  it('accepts exact text and recovers whitespace and typographic quotation differences', () => {
    expect(sourceQuote('Reports for 4 people.', '4 people')).toBe('4 people');
    expect(sourceQuote('Worked on\r\n  “Example” reports.', 'on "Example" reports.')).toBe('on\r\n  “Example” reports.');
    expect(sourceQuote('A\u00a0budget', 'A budget')).toBe('A\u00a0budget');
  });
  it('never repairs paraphrases, changed figures, missing sources or blank citations', () => {
    expect(sourceQuote('Supported delivery.', 'Led delivery.')).toBeNull();
    expect(sourceQuote('4 staff', '40 staff')).toBeNull();
    expect(sourceQuote(undefined, '4 staff')).toBeNull();
    expect(sourceQuote('4 staff', ' ')).toBeNull();
  });
});
