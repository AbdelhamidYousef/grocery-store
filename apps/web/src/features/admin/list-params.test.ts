import { ProductStatusSchema } from '@store/shared';
import { describe, expect, it } from 'vitest';

import { parseAdminList } from './list-params';

const parse = (query: string) => parseAdminList(new URLSearchParams(query), ProductStatusSchema);

describe('admin list params', () => {
  it('reads search, status and page from the URL', () => {
    expect(parse('q=tug&status=draft&page=3')).toEqual({ q: 'tug', status: 'draft', page: 3 });
  });

  it('falls back to defaults for hand-edited garbage', () => {
    expect(parse('status=nope&page=-2')).toEqual({ q: '', status: undefined, page: 1 });
    expect(parse('page=1.5')).toEqual({ q: '', status: undefined, page: 1 });
    expect(parse('page=abc').page).toBe(1);
  });

  it('caps an absurdly long search to what the API accepts', () => {
    expect(parse(`q=${'a'.repeat(300)}`).q).toHaveLength(100);
  });
});
