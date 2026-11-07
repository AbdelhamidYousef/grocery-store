import { Link } from 'react-router-dom';

import { ChevronDownIcon } from '../../components/icons';
import { useDisclosure } from '../../components/layout/use-disclosure';
import { cn } from '../../lib/cn';

import { useActivePet } from './ActivePetProvider';
import { speciesLabel } from './age';

const itemClass =
  'flex min-h-11 w-full items-center rounded-control px-3 text-left font-semibold hover:bg-pet-soft';

// The pet choices as plain buttons (pressed = the one we shop for) and links. Shared by the
// header pill (a disclosure) and the mobile drawer (always open).
export function PetChoices({ onPick }: { onPick?: () => void }) {
  const { pets, activePet, setActivePet } = useActivePet();
  return (
    <ul className="flex flex-col gap-1">
      {pets.map((pet) => (
        <li key={pet.id}>
          <button
            type="button"
            aria-pressed={activePet?.id === pet.id}
            data-testid="pet-choice"
            onClick={() => {
              setActivePet(pet);
              onPick?.();
            }}
            className={cn(itemClass, 'aria-pressed:bg-pet-soft')}
          >
            <span className="min-w-0 flex-1 truncate">{pet.name}</span>
            <span className="ml-2 shrink-0 text-sm font-normal text-muted">
              {speciesLabel(pet.species)}
            </span>
          </button>
        </li>
      ))}
      {pets.length > 0 && (
        <li>
          <button
            type="button"
            aria-pressed={activePet === null}
            data-testid="pet-choice-everyone"
            onClick={() => {
              setActivePet(null);
              onPick?.();
            }}
            className={cn(itemClass, 'aria-pressed:bg-pet-soft')}
          >
            Everyone
          </button>
        </li>
      )}
      <li>
        <Link to="/account/pets?add=1" onClick={onPick} className={itemClass}>
          Add a pet
        </Link>
      </li>
      {pets.length > 0 && (
        <li>
          <Link to="/account/pets" onClick={onPick} className={itemClass}>
            Manage pets
          </Link>
        </li>
      )}
    </ul>
  );
}

// "Shopping for Biscuit" pill in the header. A disclosure like the account menu (not role=menu:
// the panel holds ordinary buttons and links, and a menu role would promise arrow-key behaviour).
export function PetSwitcher() {
  const { activePet, pets } = useActivePet();
  const { open, setOpen, wrapper, button, panelId } = useDisclosure();
  const label = activePet
    ? `Shopping for ${activePet.name}`
    : pets.length > 0
      ? 'Shopping for everyone'
      : 'Add your pet';

  return (
    <div ref={wrapper} className="relative" data-testid="pet-switcher">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        data-testid="pet-switcher-button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 max-w-56 items-center gap-1 rounded-full border-2 border-line px-3 text-sm font-semibold hover:bg-pet-soft"
      >
        <span className="truncate">{label}</span>
        <ChevronDownIcon width={16} height={16} className="shrink-0" />
      </button>
      {open && (
        <div
          id={panelId}
          data-testid="pet-switcher-panel"
          className="absolute right-0 top-full z-40 mt-2 max-h-[70vh] w-64 overflow-y-auto rounded-card border border-line bg-surface p-2 shadow-card"
        >
          <PetChoices onPick={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
