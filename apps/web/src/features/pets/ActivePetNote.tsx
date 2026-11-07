import type { ProductListQuery } from '@store/shared';

import { Button } from '../../components/ui/Button';
import type { ListPatch } from '../catalog/list-params';

import { useActivePet } from './ActivePetProvider';

// One line above the list while the active pet's filters are on: says why the list looks the way
// it does, and clears it in one click (the chips can be removed one by one as well).
export function ActivePetNote({
  query,
  update,
}: {
  query: ProductListQuery;
  update: (patch: ListPatch) => void;
}) {
  const { activePet } = useActivePet();
  if (!activePet || !query.attr.pet?.includes(activePet.species)) return null;
  return (
    <p
      data-testid="active-pet-note"
      className="mb-3 flex flex-wrap items-center gap-x-3 text-sm font-semibold"
    >
      <span className="min-w-0 break-words">Showing what suits {activePet.name}.</span>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => update({ attr: { pet: [], ageStage: [] } })}
        data-testid="active-pet-clear"
      >
        Show all pets
      </Button>
    </p>
  );
}
