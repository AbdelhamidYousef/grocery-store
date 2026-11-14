import type { FeedingRow, LifeStage } from '@store/shared';

import { useT, type StringKey } from '../../../i18n';
import { useFormat } from '../../../i18n/format';
import { formatGrams, formatKgNumber } from '../../../lib/units';

export const STAGE_KEYS: Record<LifeStage, StringKey> = {
  any: 'pdp.feeding.stage.any',
  puppy: 'pdp.feeding.stage.puppy',
  adult: 'pdp.feeding.stage.adult',
  senior: 'pdp.feeding.stage.senior',
};

// The plain table behind the calculator: every band as text, so the numbers are readable (and
// findable) without using the calculator at all.
export function FeedingTable({ rows }: { rows: readonly FeedingRow[] }) {
  const { t } = useT();
  const { locale } = useFormat();
  const showStage = new Set(rows.map((r) => r.lifeStage)).size > 1;
  return (
    <div className="overflow-x-auto">
      <table data-testid="feeding-table" className="w-full min-w-[18rem] text-left">
        <caption className="pb-2 text-left text-sm text-muted">
          {t('pdp.feeding.table.caption')}
        </caption>
        <thead>
          <tr className="border-b-2 border-line">
            {showStage && (
              <th scope="col" className="py-2 pr-4">
                {t('pdp.feeding.table.stage')}
              </th>
            )}
            <th scope="col" className="py-2 pr-4">
              {t('pdp.feeding.table.weight')}
            </th>
            <th scope="col" className="py-2">
              {t('pdp.feeding.table.perDay')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={`${r.lifeStage}-${r.petWeightGMin}`}>
              {showStage && <td className="py-2 pr-4">{t(STAGE_KEYS[r.lifeStage])}</td>}
              <td className="py-2 pr-4">
                {t('pdp.feeding.table.weightRange', {
                  from: formatKgNumber(r.petWeightGMin, locale),
                  to: formatKgNumber(r.petWeightGMax, locale),
                })}
              </td>
              <td className="py-2">{formatGrams(r.dailyG, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
