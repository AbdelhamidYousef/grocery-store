import { account } from './fr/account';
import { auth } from './fr/auth';
import { cart } from './fr/cart';
import { catalog } from './fr/catalog';
import { checkout } from './fr/checkout';
import { content } from './fr/content';
import { loyalty } from './fr/loyalty';
import { pdp } from './fr/pdp';
import { pets } from './fr/pets';
import { returns } from './fr/returns';
import { reviews } from './fr/reviews';
import { search } from './fr/search';
import { shell } from './fr/shell';
import type { Dictionary } from './types';

export const fr: Dictionary = {
  ...shell,
  ...search,
  ...catalog,
  ...pdp,
  ...reviews,
  ...cart,
  ...checkout,
  ...account,
  ...auth,
  ...returns,
  ...loyalty,
  ...pets,
  ...content,
};
