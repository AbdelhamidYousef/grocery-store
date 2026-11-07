import type { Constituent, ConstituentKey, Spec } from '@store/shared';

import { bpToPercent } from '../../../lib/units';

const LABELS: Record<ConstituentKey, string> = {
  protein: 'Protein',
  fat: 'Fat',
  fibre: 'Fibre',
  ash: 'Ash',
  moisture: 'Moisture',
  kcal: 'Energy',
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
  return (
    <div className="flex flex-col gap-8">
      {specs.length > 0 && (
        <section aria-labelledby="specs-heading">
          <h3 id="specs-heading" className="font-display text-xl font-bold">
            Specifications
          </h3>
          <table data-testid="specs-table" className="mt-3 w-full text-left">
            <tbody className="divide-y divide-line">
              {specs.map((s) => (
                <tr key={s.label}>
                  <th
                    scope="row"
                    className="w-2/5 py-2 pr-4 align-top font-semibold text-pet-strong"
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
            Guaranteed analysis
          </h3>
          <p className="text-sm text-muted">Per 100 g{variantName ? `, ${variantName}` : ''}.</p>
          <table data-testid="constituents-table" className="mt-3 w-full text-left">
            <tbody className="divide-y divide-line">
              {constituents.map((c) => (
                <tr key={c.key}>
                  <th scope="row" className="w-2/5 py-2 pr-4 font-semibold text-pet-strong">
                    {LABELS[c.key]}
                  </th>
                  <td className="py-2">
                    {c.key === 'kcal' ? `${c.valueBp} kcal` : `${bpToPercent(c.valueBp)} %`}
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
