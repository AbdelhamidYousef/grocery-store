import { PET_VALUES } from '@store/shared';
import { pgEnum } from 'drizzle-orm/pg-core';

// Same values as the shared PET_VALUES constant (the one source of truth for which pets exist), so
// a menu promo can never name a species the catalogue has no products for.
export const petSpecies = pgEnum('pet_species', PET_VALUES);
