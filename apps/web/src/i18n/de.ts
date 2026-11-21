import { account } from './de/account';
import { auth } from './de/auth';
import { cart } from './de/cart';
import { catalog } from './de/catalog';
import { checkout } from './de/checkout';
import { content } from './de/content';
import { delivery } from './de/delivery';
import { expiry } from './de/expiry';
import { loyalty } from './de/loyalty';
import { pdp } from './de/pdp';
import { returns } from './de/returns';
import { reviews } from './de/reviews';
import { search } from './de/search';
import { shell } from './de/shell';
import { weight } from './de/weight';
import type { en } from './en';
import type { Entry } from './types';

export const de: Record<keyof typeof en, Entry> = {
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
  ...content,
  ...delivery,
  ...expiry,
  ...weight,
};
