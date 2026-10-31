import { beforeEach, describe, expect, it } from 'vitest';

import { acknowledgeNotice, CONSENT_KEY, hasConsent, hasSeenNotice } from './consent';

beforeEach(() => window.localStorage.clear());

describe('consent', () => {
  it('says no to every optional category, before and after the notice is acknowledged', () => {
    for (const category of ['analytics', 'marketing', 'preferences'] as const) {
      expect(hasConsent(category)).toBe(false);
    }
    acknowledgeNotice();
    for (const category of ['analytics', 'marketing', 'preferences'] as const) {
      expect(hasConsent(category)).toBe(false);
    }
  });

  it('treats strictly necessary cookies as always allowed', () => {
    expect(hasConsent('necessary')).toBe(true);
  });

  it('remembers that the notice was seen, under the versioned key, outside cookies', () => {
    expect(hasSeenNotice()).toBe(false);
    acknowledgeNotice();
    expect(hasSeenNotice()).toBe(true);
    expect(window.localStorage.getItem(CONSENT_KEY)).toContain('"v":1');
    expect(document.cookie).toBe('');
  });

  it('ignores a corrupt record instead of throwing', () => {
    window.localStorage.setItem(CONSENT_KEY, '{not json');
    expect(hasSeenNotice()).toBe(false);
    window.localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({ v: 1, at: 'x', granted: ['analytics'] }),
    );
    // A hand-edited grant is honoured only because it is well formed; there is no UI that writes it.
    expect(hasConsent('analytics')).toBe(true);
  });
});
