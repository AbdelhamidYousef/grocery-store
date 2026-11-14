import { describe, expect, it } from 'vitest';

import { detailsDefaults, shippingCountries } from './details';

describe('countries per store view', () => {
  it('offers only the store countries that the shop ships to', () => {
    expect(shippingCountries('en', ['GB']).map((c) => c.code)).toEqual(['GB']);
    expect(
      shippingCountries('de-DE', ['DE', 'AT', 'BG'])
        .map((c) => c.code)
        .sort(),
    ).toEqual(['AT', 'DE']);
  });

  it('defaults to a country of the store, not to Germany, in the UK store', () => {
    expect(detailsDefaults(null, undefined, ['GB']).shippingAddress.country).toBe('GB');
    expect(detailsDefaults(null, undefined, ['FR', 'BE']).shippingAddress.country).toBe('FR');
  });
});
