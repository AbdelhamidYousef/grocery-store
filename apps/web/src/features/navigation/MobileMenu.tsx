import { useId, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';

import { ChevronDownIcon, PetGlyph } from '../../components/icons';
import { cn } from '../../lib/cn';
import { PETS } from '../../lib/pets';

import { MAX_MENU_CATEGORIES } from './MegaMenu';
import { PromoTile } from './PromoTile';
import { useNavigation } from './queries';

const rowClass =
  'flex min-h-12 w-full items-center gap-3 rounded-control px-3 text-left font-display text-lg font-semibold hover:bg-pet-soft';
const subLink =
  'flex min-h-11 items-center rounded-control px-3 hover:bg-pet-soft aria-[current=page]:bg-pet-soft';

// The same menu inside the mobile drawer: one accordion level per pet. The drawer itself is a
// modal <dialog> (focus trap, Escape and scroll lock come from it); every row is 44 px or more.
export function MobileMenu({ onNavigate }: { onNavigate: () => void }) {
  const { data } = useNavigation();
  const [openPet, setOpenPet] = useState<string | null>(null);
  const baseId = useId();
  const pets = data?.pets ?? [];

  if (pets.length === 0) {
    return (
      <ul className="flex flex-col gap-1">
        {PETS.map((pet) => (
          <li key={pet.slug} data-pet={pet.accent}>
            <NavLink to={`/c/${pet.slug}`} onClick={onNavigate} className={rowClass}>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-pet-accent text-ink">
                <PetGlyph icon={pet.icon} width={22} height={22} />
              </span>
              {pet.name}
            </NavLink>
          </li>
        ))}
        <li>
          <NavLink to="/brands" onClick={onNavigate} className={rowClass}>
            Brands
          </NavLink>
        </li>
      </ul>
    );
  }

  return (
    <ul className="flex flex-col gap-1">
      {pets.map((entry) => {
        const meta = PETS.find(
          (p) => p.accent === (entry.pet === 'small' ? 'small-pet' : entry.pet),
        );
        const open = openPet === entry.pet;
        const panelId = `${baseId}-${entry.pet}`;
        return (
          <li key={entry.pet} data-pet={meta?.accent}>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={panelId}
              data-testid="mobile-menu-button"
              onClick={() => setOpenPet(open ? null : entry.pet)}
              className={rowClass}
            >
              {meta && (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pet-accent text-ink">
                  <PetGlyph icon={meta.icon} width={22} height={22} />
                </span>
              )}
              <span className="min-w-0 flex-1">{entry.name}</span>
              <ChevronDownIcon
                width={20}
                height={20}
                className={cn('shrink-0 transition-transform', open && 'rotate-180')}
              />
            </button>
            {open && (
              <div id={panelId} className="mb-2 ml-3 border-l-2 border-line pl-3">
                <ul>
                  {entry.categories.slice(0, MAX_MENU_CATEGORIES).map((c) => (
                    <li key={c.slug}>
                      <Link to={`/c/${c.slug}`} onClick={onNavigate} className={subLink}>
                        {c.name}
                      </Link>
                    </li>
                  ))}
                  <li>
                    <Link
                      to={`/c/${entry.categorySlug}`}
                      onClick={onNavigate}
                      className={`${subLink} font-semibold text-primary-strong`}
                    >
                      {entry.categories.length > MAX_MENU_CATEGORIES
                        ? `See all ${entry.name}`
                        : `All ${entry.name}`}
                    </Link>
                  </li>
                </ul>
                {entry.brands.length > 0 && (
                  <>
                    <p className="mt-2 px-3 font-display text-sm font-bold text-muted">Brands</p>
                    <ul>
                      {entry.brands.map((b) => (
                        <li key={b.slug}>
                          <Link to={`/brands/${b.slug}`} onClick={onNavigate} className={subLink}>
                            {b.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {entry.promo && (
                  <div className="mt-3">
                    <PromoTile promo={entry.promo} onNavigate={onNavigate} />
                  </div>
                )}
              </div>
            )}
          </li>
        );
      })}
      <li>
        <NavLink to="/brands" onClick={onNavigate} className={rowClass}>
          Brands
        </NavLink>
      </li>
    </ul>
  );
}
