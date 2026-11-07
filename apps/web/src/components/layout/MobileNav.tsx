import { NavLink } from 'react-router-dom';

import { PetChoices } from '../../features/pets/PetSwitcher';
import { PETS } from '../../lib/pets';
import { PetGlyph } from '../icons';
import { Dialog } from '../ui/Dialog';

import { SearchBox } from './SearchBox';

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
}

// The drawer is a modal <dialog> (see ui/Dialog): focus is trapped, Escape closes, and focus
// returns to the menu button. Choosing a link closes it, otherwise it would sit over the new page.
export function MobileNav({ open, onClose }: MobileNavProps) {
  return (
    <Dialog open={open} onClose={onClose} title="Menu" placement="left">
      <SearchBox idPrefix="drawer" onSearch={onClose} />
      <nav aria-label="Shop by pet" data-testid="mobile-nav">
        <ul className="flex flex-col gap-1">
          {PETS.map((pet) => (
            <li key={pet.slug} data-pet={pet.accent}>
              <NavLink
                to={`/c/${pet.slug}`}
                onClick={onClose}
                className="flex min-h-12 items-center gap-3 rounded-control px-3 font-display text-lg font-semibold hover:bg-pet-soft aria-[current=page]:bg-pet-soft"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-pet-accent text-ink">
                  <PetGlyph icon={pet.icon} width={22} height={22} />
                </span>
                {pet.name}
              </NavLink>
            </li>
          ))}
          <li>
            <NavLink
              to="/brands"
              onClick={onClose}
              className="flex min-h-12 items-center rounded-control px-3 font-display text-lg font-semibold hover:bg-pet-soft aria-[current=page]:bg-pet-soft"
            >
              Brands
            </NavLink>
          </li>
        </ul>
      </nav>
      <section aria-labelledby="drawer-pets" data-testid="mobile-pets">
        <h3 id="drawer-pets" className="mb-1 font-display text-lg font-bold">
          Shopping for
        </h3>
        <PetChoices onPick={onClose} />
      </section>
    </Dialog>
  );
}
