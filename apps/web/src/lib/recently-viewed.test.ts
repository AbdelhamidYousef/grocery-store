import { afterEach, describe, expect, it, vi } from 'vitest';

import { readRecentlyViewed, recordRecentlyViewed, RECENTLY_VIEWED_MAX } from './recently-viewed';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('recently viewed ids', () => {
  it('puts the newest first and moves a repeat to the front without duplicating it', () => {
    recordRecentlyViewed(id(1));
    recordRecentlyViewed(id(2));
    recordRecentlyViewed(id(3));
    expect(recordRecentlyViewed(id(1))).toEqual([id(1), id(3), id(2)]);
    expect(readRecentlyViewed()).toEqual([id(1), id(3), id(2)]);
  });

  it('keeps at most 12, dropping the oldest', () => {
    for (let n = 1; n <= 15; n++) recordRecentlyViewed(id(n));
    const list = readRecentlyViewed();
    expect(list).toHaveLength(RECENTLY_VIEWED_MAX);
    expect(list[0]).toBe(id(15));
    expect(list.at(-1)).toBe(id(4));
  });

  it('is empty for a first-time visitor and ignores anything in storage that is not a list of ids', () => {
    expect(readRecentlyViewed()).toEqual([]);
    window.localStorage.setItem('grocery.recently-viewed', '{"not":"a list"}');
    expect(readRecentlyViewed()).toEqual([]);
    window.localStorage.setItem('grocery.recently-viewed', 'not json');
    expect(readRecentlyViewed()).toEqual([]);
    window.localStorage.setItem(
      'grocery.recently-viewed',
      JSON.stringify([id(1), 42, '<script>', 'nope', id(2)]),
    );
    expect(readRecentlyViewed()).toEqual([id(1), id(2)]);
  });

  it('never throws when storage is blocked, and still answers with the list it would have saved', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readRecentlyViewed()).toEqual([]);
    expect(recordRecentlyViewed(id(1))).toEqual([id(1)]);
  });
});
