import { afterEach, describe, expect, it } from 'vitest';

import { recordRecentlyViewed } from '../../lib/recently-viewed';

import './builtin-slots';
import { getHomeSlots } from './slots';

afterEach(() => window.localStorage.clear());

describe('recently viewed home slot', () => {
  it('is registered under its reserved id but only enabled once the visitor has looked at something', () => {
    expect(getHomeSlots().map((s) => s.id)).not.toContain('recently-viewed');
    recordRecentlyViewed('00000000-0000-4000-8000-000000000001');
    expect(getHomeSlots().map((s) => s.id)).toContain('recently-viewed');
  });
});
