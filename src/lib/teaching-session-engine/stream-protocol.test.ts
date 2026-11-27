import { describe, expect, it } from 'vitest';
import { extractTeachingStreamError, formatTeachingStreamError } from './stream-protocol';

describe('teaching stream error protocol', () => {
  it('round-trips a streamed error', () => {
    const encoded = formatTeachingStreamError(
      'Your question was saved, but the answer could not be completed.'
    );

    expect(extractTeachingStreamError(encoded)).toBe(
      'Your question was saved, but the answer could not be completed.'
    );
  });

  it('finds an error appended after a partial answer', () => {
    expect(
      extractTeachingStreamError('Partial answer...[Error: The provider connection failed.]')
    ).toBe('The provider connection failed.');
  });

  it('does not treat ordinary lesson text as an error', () => {
    expect(extractTeachingStreamError('A normal lesson response.')).toBeNull();
  });
});
