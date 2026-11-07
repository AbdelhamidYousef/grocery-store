import type { ProductCard as ProductCardData } from '@store/shared';

import { ProductCard } from '../ProductCard';

// A short row of product cards that scrolls sideways INSIDE its own box (never widening the
// page), one card per column at a fixed width so a row of two looks the same as a row of eight.
export function ProductRail({
  cards,
  label,
  testId,
}: {
  cards: readonly ProductCardData[];
  label: string;
  testId: string;
}) {
  return (
    <ul
      aria-label={label}
      data-testid={testId}
      className="grid auto-cols-[10.5rem] grid-flow-col gap-4 overflow-x-auto pb-3 sm:auto-cols-[12.5rem]"
    >
      {cards.map((card) => (
        <ProductCard key={card.id} product={card} sizes="200px" />
      ))}
    </ul>
  );
}
