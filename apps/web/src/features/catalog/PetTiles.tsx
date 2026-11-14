import { Link } from 'react-router-dom';

import { PetGlyph } from '../../components/icons';
import { useT, type StringKey } from '../../i18n';
import { PETS } from '../../lib/pets';

import { useCategories } from './queries';

// The names, links and colours come from the typed PETS constant so the tiles paint instantly;
// the product counts are the only API data, and they fill in when the request lands.
const PET_NAMES: Record<string, StringKey> = {
  dogs: 'catalog.petTile.dogs',
  cats: 'catalog.petTile.cats',
  birds: 'catalog.petTile.birds',
  fish: 'catalog.petTile.fish',
  'small-pets': 'catalog.petTile.smallPets',
  reptiles: 'catalog.petTile.reptiles',
};

export function PetTiles() {
  const { t, tn } = useT();
  const { data: categories } = useCategories();
  const counts = new Map(categories?.map((c) => [c.slug, c.productCount]));

  return (
    <ul
      className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-6"
      data-testid="pet-tiles"
    >
      {PETS.map((pet) => {
        const count = counts.get(pet.slug);
        return (
          <li key={pet.slug} data-pet={pet.accent} className="min-w-0">
            <Link
              to={`/c/${pet.slug}`}
              className="flex h-full flex-col items-center gap-3 rounded-card bg-pet-soft p-5 text-center text-pet-strong shadow-card transition-transform hover:-translate-y-0.5"
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-pet-accent text-ink">
                <PetGlyph icon={pet.icon} width={36} height={36} />
              </span>
              <span className="font-display text-xl font-bold">
                {PET_NAMES[pet.slug] ? t(PET_NAMES[pet.slug] as StringKey) : pet.name}
              </span>
              <span className="min-h-5 text-sm font-semibold">
                {count === undefined ? '' : tn('catalog.productCount', count)}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
