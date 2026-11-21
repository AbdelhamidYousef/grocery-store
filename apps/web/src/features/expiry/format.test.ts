import { describe, expect, it } from 'vitest';

import { formatBestBefore } from './format';

describe('formatBestBefore', () => {
  it('prints the calendar day in the store language, whatever the browser zone', () => {
    expect(formatBestBefore('2026-11-25', 'en-IE')).toBe('25 Nov');
    expect(formatBestBefore('2026-11-25', 'de-DE')).toBe('25. Nov.');
    expect(formatBestBefore('2027-01-01', 'en-IE')).toBe('1 Jan');
  });
  it('gives nothing for something that is not a date', () => {
    expect(formatBestBefore('soon', 'en-IE')).toBe('');
  });
});
