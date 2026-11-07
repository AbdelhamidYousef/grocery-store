import type { ProductListQuery, QuickChip } from '@store/shared';

import { cn } from '../../lib/cn';
import { TEST_IDS } from '../../lib/test-ids';

import type { ListPatch } from './list-params';

// One-click filters above the grid, in the order the API sent them (see buildQuickChips). Each is
// a toggle button: pressing it adds or removes its value from the URL, and `aria-pressed` tells a
// screen reader which are on. The same values also appear in the sidebar and as removable chips
// below; this row is only the shortcut.
export function QuickChips({
  chips,
  query,
  update,
}: {
  chips: QuickChip[];
  query: ProductListQuery;
  update: (patch: ListPatch) => void;
}) {
  if (chips.length === 0) return null;

  const selectedOf = (chip: QuickChip): string[] =>
    (chip.kind === 'badge' ? query.badge : chip.kind === 'brand' ? query.brand : query.tag) ?? [];

  const toggle = (chip: QuickChip) => {
    const selected = selectedOf(chip);
    const next = selected.includes(chip.value)
      ? selected.filter((v) => v !== chip.value)
      : [...selected, chip.value];
    update({ [chip.kind]: next });
  };

  return (
    <ul
      aria-label="Quick filters"
      data-testid={TEST_IDS.quickChips}
      className="mb-3 flex flex-wrap gap-2"
    >
      {chips.map((chip) => {
        const pressed = selectedOf(chip).includes(chip.value);
        return (
          <li key={`${chip.kind}:${chip.value}`} className="max-w-full">
            <button
              type="button"
              aria-pressed={pressed}
              data-testid={TEST_IDS.quickChip}
              onClick={() => toggle(chip)}
              className={cn(
                'inline-flex min-h-11 max-w-full items-center gap-2 rounded-full border-2 px-4 text-sm font-semibold',
                pressed
                  ? 'border-primary bg-primary-soft text-primary-strong'
                  : 'border-line bg-surface hover:bg-pet-soft',
              )}
            >
              <span className="min-w-0 break-words">{chip.label}</span>
              <span className="text-muted">{chip.count}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
