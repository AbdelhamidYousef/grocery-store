import type { FeedingRow, LifeStage } from '@store/shared';

import { formatGrams, gramsToKg } from '../../../lib/units';

const STAGE: Record<LifeStage, string> = {
  any: 'All life stages',
  puppy: 'Puppy or kitten',
  adult: 'Adult',
  senior: 'Senior',
};

// The plain table behind the calculator: every band as text, so the numbers are readable (and
// findable) without using the calculator at all.
export function FeedingTable({ rows }: { rows: readonly FeedingRow[] }) {
  const showStage = new Set(rows.map((r) => r.lifeStage)).size > 1;
  return (
    <div className="overflow-x-auto">
      <table data-testid="feeding-table" className="w-full min-w-[18rem] text-left">
        <caption className="pb-2 text-left text-sm text-muted">
          Daily amount by pet weight. Guidance only.
        </caption>
        <thead>
          <tr className="border-b-2 border-line">
            {showStage && (
              <th scope="col" className="py-2 pr-4">
                Life stage
              </th>
            )}
            <th scope="col" className="py-2 pr-4">
              Pet weight
            </th>
            <th scope="col" className="py-2">
              Per day
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={`${r.lifeStage}-${r.petWeightGMin}`}>
              {showStage && <td className="py-2 pr-4">{STAGE[r.lifeStage]}</td>}
              <td className="py-2 pr-4">
                {gramsToKg(r.petWeightGMin)} to {gramsToKg(r.petWeightGMax)} kg
              </td>
              <td className="py-2">{formatGrams(r.dailyG)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
