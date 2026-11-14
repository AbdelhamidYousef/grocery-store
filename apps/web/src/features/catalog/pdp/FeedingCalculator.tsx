import {
  calculateFeeding,
  costPerDayCents,
  daysPerBag,
  LIFE_STAGES,
  packForDays,
  rowsForStage,
  type LifeStage,
  type ProductDetail,
  type Variant,
} from '@store/shared';
import { useId, useState } from 'react';

import { Button } from '../../../components/ui/Button';
import { useT, type StringKey } from '../../../i18n';
import { useFormat } from '../../../i18n/format';
import { cn } from '../../../lib/cn';
import { TEST_IDS } from '../../../lib/test-ids';
import { formatGrams, formatKgNumber, gramsToKg, kgToGrams } from '../../../lib/units';

import { STAGE_KEYS } from './FeedingTable';

// The sentence for N meals a day; one key per count so each language words it whole.
const DAILY_KEYS: Record<number, StringKey> = {
  1: 'pdp.feeding.daily.1',
  2: 'pdp.feeding.daily.2',
  3: 'pdp.feeding.daily.3',
  4: 'pdp.feeding.daily.4',
};
const MONTH_DAYS = 30;

// What the product says about its own age range decides the first life stage shown; the shopper
// can change it. (The active pet from phase 15 will feed the same prop later.)
function stageFor(ageStage: string | undefined, available: readonly LifeStage[]): LifeStage {
  const wanted: LifeStage =
    ageStage === 'puppy' || ageStage === 'kitten'
      ? 'puppy'
      : ageStage === 'senior'
        ? 'senior'
        : ageStage === 'adult'
          ? 'adult'
          : 'any';
  return available.includes(wanted) ? wanted : (available[0] ?? 'any');
}

// The packs the "pick a bag that lasts a month" button may switch to: other sizes of what the
// shopper is already looking at (same flavour and colour), never a trial sample or a sold-out one.
function packCandidates(product: ProductDetail, current: Variant) {
  const same = (v: Variant) =>
    Object.entries(current.options).every(
      ([key, value]) => key === 'pack' || key === 'size' || v.options[key] === value,
    );
  return product.variants
    .filter(
      (v) => !v.isTrial && v.available && v.netUnit === 'g' && v.netAmount !== null && same(v),
    )
    .map((v) => ({ variant: v, packG: v.netAmount ?? 0 }));
}

// Mid-table weight, rounded to 100 g: a start that is not an extreme.
function startWeightG(rows: { petWeightGMin: number; petWeightGMax: number }[]): number {
  const mid = rows[Math.floor(rows.length / 2)];
  if (!mid) return 5000;
  return Math.round((mid.petWeightGMin + mid.petWeightGMax) / 2 / 100) * 100;
}

export function FeedingCalculator({
  product,
  variant,
  onPickVariant,
}: {
  product: ProductDetail;
  variant: Variant | undefined;
  onPickVariant: (variant: Variant) => void;
}) {
  const { t, tn } = useT();
  const fmt = useFormat();
  const stages = LIFE_STAGES.filter((s) => product.feedingTable.some((r) => r.lifeStage === s));
  const [stage, setStage] = useState<LifeStage>(stageFor(product.attributes.ageStage, stages));
  const rows = rowsForStage(product.feedingTable, stage);
  const [weightText, setWeightText] = useState(() => gramsToKg(startWeightG(rows)));
  const [meals, setMeals] = useState(2);
  const ids = useId();

  const first = rows[0];
  const last = rows[rows.length - 1];
  if (!first || !last) return null;
  const minG = first.petWeightGMin;
  // The slider moves in 100 g steps from the lower edge; the number box can still take any weight.
  const maxG = minG + Math.floor((last.petWeightGMax - 1 - minG) / 100) * 100;

  const weightG = kgToGrams(weightText);
  const result =
    weightG === null
      ? null
      : calculateFeeding(product.feedingTable, {
          weightG,
          lifeStage: stage,
          portions: meals,
        });

  const packG = variant?.netUnit === 'g' ? variant.netAmount : null;
  // The price the shopper sees (a running sale counts); a member price is for signed-in shoppers
  // only and the guide must read the same for everyone.
  const priceCents = variant ? (variant.sale?.priceCents ?? variant.priceCents) : null;
  const days = result && packG ? daysPerBag(packG, result.dailyG) : null;
  const perDay =
    result && packG && priceCents !== null
      ? costPerDayCents(priceCents, packG, result.dailyG)
      : null;
  const monthly =
    result && variant
      ? packForDays(packCandidates(product, variant), result.dailyG, MONTH_DAYS)
      : null;
  const lastsAMonth = days !== null && days >= MONTH_DAYS;

  // The cup shows the day's amount against the biggest amount in the table.
  const maxDaily = Math.max(...rows.map((r) => r.dailyG));
  const fill = result
    ? Math.min(100, Math.max(8, Math.round((result.dailyG * 100) / maxDaily)))
    : 0;

  const setWeight = (grams: number) => setWeightText(gramsToKg(grams));

  return (
    <section
      aria-labelledby={`${ids}-heading`}
      data-testid={TEST_IDS.feedingCalculator}
      className="rounded-card border-2 border-pet bg-pet-soft p-4 sm:p-6"
    >
      <h3 id={`${ids}-heading`} className="font-display text-xl font-bold">
        {t('pdp.feeding.heading')}
      </h3>
      <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor={`${ids}-weight`} className="font-semibold">
                {t('pdp.feeding.weightLabel')}
              </label>
              <input
                id={`${ids}-weight`}
                data-testid="feeding-weight"
                inputMode="decimal"
                value={weightText}
                onChange={(e) => setWeightText(e.target.value)}
                aria-invalid={weightG === null ? true : undefined}
                aria-describedby={`${ids}-result`}
                className="min-h-11 w-28 rounded-control border-2 border-muted bg-surface px-3 text-base aria-[invalid=true]:border-danger"
              />
            </div>
            {stages.length > 1 && (
              <div className="flex flex-col gap-1">
                <label htmlFor={`${ids}-stage`} className="font-semibold">
                  {t('pdp.feeding.stageLabel')}
                </label>
                <select
                  id={`${ids}-stage`}
                  value={stage}
                  onChange={(e) => setStage(e.target.value as LifeStage)}
                  className="min-h-11 rounded-control border-2 border-muted bg-surface px-3 text-base"
                >
                  {stages.map((s) => (
                    <option key={s} value={s}>
                      {t(STAGE_KEYS[s])}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label htmlFor={`${ids}-meals`} className="font-semibold">
                {t('pdp.feeding.mealsLabel')}
              </label>
              <select
                id={`${ids}-meals`}
                value={meals}
                onChange={(e) => setMeals(Number(e.target.value))}
                className="min-h-11 rounded-control border-2 border-muted bg-surface px-3 text-base"
              >
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${ids}-slider`} className="sr-only">
              {t('pdp.feeding.sliderLabel')}
            </label>
            <input
              id={`${ids}-slider`}
              type="range"
              min={minG}
              max={maxG}
              step={100}
              value={Math.min(maxG, Math.max(minG, weightG ?? minG))}
              onChange={(e) => setWeight(Number(e.target.value))}
              className="min-h-11 w-full accent-primary"
            />
            <div className="flex justify-between text-sm text-muted" aria-hidden="true">
              <span>{t('pdp.feeding.rangeKg', { value: formatKgNumber(minG, fmt.locale) })}</span>
              <span>{t('pdp.feeding.rangeKg', { value: formatKgNumber(maxG, fmt.locale) })}</span>
            </div>
          </div>

          <output id={`${ids}-result`} data-testid="feeding-result" className="flex flex-col gap-1">
            {weightG === null ? (
              <span className="font-semibold text-danger">{t('pdp.feeding.invalidWeight')}</span>
            ) : result ? (
              <>
                <span className="text-lg font-bold" data-testid="feeding-daily">
                  {t(DAILY_KEYS[result.portions] ?? 'pdp.feeding.daily.2', {
                    daily: formatGrams(result.dailyG, fmt.locale),
                    portion: formatGrams(result.gramsPerPortion, fmt.locale),
                  })}
                </span>
                {result.clamped && (
                  <span data-testid="feeding-clamp" className="font-semibold text-danger">
                    {result.clamped === 'below'
                      ? t('pdp.feeding.clampBelow', {
                          from: formatKgNumber(result.coversFromG, fmt.locale),
                        })
                      : t('pdp.feeding.clampAbove', {
                          to: formatKgNumber(result.coversToG, fmt.locale),
                          last: formatKgNumber(result.coversToG - 1, fmt.locale),
                        })}
                  </span>
                )}
                {days !== null && perDay !== null && variant && (
                  <span data-testid="feeding-bag">
                    {days === 0
                      ? t('pdp.feeding.bagLessThanDay')
                      : tn('pdp.feeding.bagLasts', days, {
                          price: fmt.money(perDay, variant.currency),
                        })}
                  </span>
                )}
              </>
            ) : null}
          </output>

          {result &&
            variant &&
            packG &&
            !lastsAMonth &&
            monthly &&
            monthly.variant.id !== variant.id && (
              <div>
                <Button
                  type="button"
                  variant="secondary"
                  data-testid="feeding-pick-month"
                  onClick={() => onPickVariant(monthly.variant)}
                >
                  {t('pdp.feeding.pickMonth')}
                </Button>
                <p className="mt-1 text-sm text-muted">
                  {tn('pdp.feeding.pickMonthNote', daysPerBag(monthly.packG, result.dailyG), {
                    name: monthly.variant.name,
                  })}
                </p>
              </div>
            )}
          {result && lastsAMonth && (
            <p className="text-sm text-muted">{t('pdp.feeding.alreadyMonth')}</p>
          )}

          <p className="text-sm text-muted">{t('pdp.feeding.disclaimer')}</p>
        </div>

        <div
          aria-hidden="true"
          data-testid="feeding-cup"
          className="mx-auto hidden h-32 w-24 items-end overflow-hidden rounded-b-[2rem] border-4 border-ink bg-surface md:flex"
        >
          <div
            className={cn(
              'w-full bg-primary transition-[height] duration-500 ease-out motion-reduce:transition-none',
            )}
            style={{ height: `${fill}%` }}
          />
        </div>
      </div>
    </section>
  );
}
