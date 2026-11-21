import type { Constituent, ConstituentKey, Spec } from '@store/shared';

import { useT, type StringKey } from '../../../i18n';
import { useFormat } from '../../../i18n/format';

const LABELS: Record<ConstituentKey, StringKey> = {
  protein: 'pdp.specs.constituent.protein',
  fat: 'pdp.specs.constituent.fat',
  fibre: 'pdp.specs.constituent.fibre',
  ash: 'pdp.specs.constituent.ash',
  moisture: 'pdp.specs.constituent.moisture',
  kcal: 'pdp.specs.constituent.kcal',
};

// Specs as a table and the guaranteed analysis of the SELECTED variant (it can differ per size).
export function SpecsPanel({
  specs,
  constituents,
  variantName,
}: {
  specs: readonly Spec[];
  constituents: readonly Constituent[];
  variantName?: string;
}) {
  const { t } = useT();
  const fmt = useFormat();
  return (
    <div className="flex flex-col gap-8">
      {specs.length > 0 && (
        <section aria-labelledby="specs-heading">
          <h3 id="specs-heading" className="font-display text-xl font-bold">
            {t('pdp.specs.heading')}
          </h3>
          <table data-testid="specs-table" className="mt-3 w-full text-left">
            <tbody className="divide-y divide-line">
              {specs.map((s) => (
                <tr key={s.label}>
                  <th
                    scope="row"
                    className="w-2/5 py-2 pr-4 align-top font-semibold text-dept-strong"
                  >
                    {s.label}
                  </th>
                  <td className="min-w-0 break-words py-2">{s.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {constituents.length > 0 && (
        <section aria-labelledby="constituents-heading">
          <h3 id="constituents-heading" className="font-display text-xl font-bold">
            {t('pdp.specs.analysis')}
          </h3>
          <p className="text-sm text-muted">
            {variantName
              ? t('pdp.specs.per100Variant', { variant: variantName })
              : t('pdp.specs.per100')}
          </p>
          <table data-testid="constituents-table" className="mt-3 w-full text-left">
            <tbody className="divide-y divide-line">
              {constituents.map((c) => (
                <tr key={c.key}>
                  <th scope="row" className="w-2/5 py-2 pr-4 font-semibold text-dept-strong">
                    {t(LABELS[c.key])}
                  </th>
                  <td className="py-2">
                    {c.key === 'kcal'
                      ? t('pdp.specs.kcal', { value: c.valueBp })
                      : t('pdp.specs.percent', {
                          value: fmt.number(c.valueBp / 100, { maximumFractionDigits: 2 }),
                        })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
