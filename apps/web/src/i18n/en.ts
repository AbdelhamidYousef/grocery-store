import { account } from './en/account';
import { auth } from './en/auth';
import { cart } from './en/cart';
import { catalog } from './en/catalog';
import { checkout } from './en/checkout';
import { content } from './en/content';
import { delivery } from './en/delivery';
import { expiry } from './en/expiry';
import { loyalty } from './en/loyalty';
import { pdp } from './en/pdp';
import { returns } from './en/returns';
import { reviews } from './en/reviews';
import { search } from './en/search';
import { shell } from './en/shell';
import { weight } from './en/weight';

// One file per area keeps the dictionary readable and lets areas be translated independently.
export const en = {
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
