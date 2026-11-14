import { cn } from '../../lib/cn';
import { TEST_IDS } from '../../lib/test-ids';

// Five rows, 5 stars first. Each row is a button that filters the list to that rating (pressed
// again it clears), with the count and the bar both derived from the same numbers.
export function StarBreakdown({
  breakdown,
  active,
  onPick,
}: {
  /** Index 0 = number of 1-star reviews ... index 4 = number of 5-star reviews. */
  breakdown: readonly number[];
  active: number | undefined;
  onPick: (rating: number | undefined) => void;
}) {
  const total = breakdown.reduce((a, b) => a + b, 0);
  return (
    <ul
      data-testid={TEST_IDS.reviewBreakdown}
      aria-label="Reviews by star rating"
      className="flex flex-col gap-1"
    >
      {[5, 4, 3, 2, 1].map((stars) => {
        const count = breakdown[stars - 1] ?? 0;
        // Whole percent, integer maths: a bar needs no more precision than that.
        const pct = total === 0 ? 0 : Math.round((count * 100) / total);
        const pressed = active === stars;
        return (
          <li key={stars}>
            <button
              type="button"
              aria-pressed={pressed}
              aria-label={`${stars} star reviews: ${count}${pressed ? ', filter on' : ''}`}
              onClick={() => onPick(pressed ? undefined : stars)}
              className={cn(
                'flex min-h-9 w-full items-center gap-3 rounded-control px-2 text-sm hover:bg-pet-soft',
                pressed && 'bg-pet-soft font-semibold',
              )}
            >
              <span className="w-12 shrink-0 text-left" aria-hidden="true">
                {stars} star{stars === 1 ? '' : 's'}
              </span>
              <span
                className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-line"
                aria-hidden="true"
              >
                <span className="block h-full rounded-full bg-star" style={{ width: `${pct}%` }} />
              </span>
              <span className="w-8 shrink-0 text-right tabular-nums" aria-hidden="true">
                {count}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
