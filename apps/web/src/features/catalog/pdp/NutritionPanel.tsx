import { NUTRITION_ROWS, formatTenths, parseIngredients, type FoodInfo } from '@store/shared';

import { useT, type StringKey } from '../../../i18n';
import { useFormat } from '../../../i18n/format';
import { labelLang, useFoodLabels } from '../../../lib/food-labels';

const ROW_LABELS: Record<(typeof NUTRITION_ROWS)[number]['key'], StringKey> = {
  fat: 'pdp.food.fat',
  saturates: 'pdp.food.saturates',
  carbs: 'pdp.food.carbs',
  sugars: 'pdp.food.sugars',
  fibre: 'pdp.food.fibre',
  protein: 'pdp.food.protein',
  salt: 'pdp.food.salt',
};

// The "Nutrition & ingredients" tab: an EU-style table (per 100 g or 100 ml), the ingredients
// with allergens in bold, and the allergens listed in words. Nutrients are stored as integer
// tenths of a gram and printed here with one decimal at most, so 31 reads "3.1 g".
export function NutritionPanel({
  food,
  unit,
}: {
  food: FoodInfo;
  /** What the table is per: 100 g for solids, 100 ml for drinks and other liquids. */
  unit: 'g' | 'ml';
}) {
  const { t } = useT();
  const fmt = useFormat();
  const labels = useFoodLabels();
  const decimal = labelLang(fmt.locale) === 'de' ? ',' : '.';
  const { nutrition, ingredients, allergens } = food;

  return (
    <div className="flex max-w-2xl flex-col gap-8" data-testid="nutrition-panel">
      {nutrition && (
        <section aria-labelledby="nutrition-heading">
          <h3 id="nutrition-heading" className="font-display text-xl font-bold">
            {t('pdp.food.nutritionHeading')}
          </h3>
          <table data-testid="nutrition-table" className="mt-3 w-full max-w-md text-left">
            <caption className="sr-only">{t('pdp.food.nutritionHeading')}</caption>
            <thead>
              <tr className="border-b-2 border-ink">
                <th scope="col" className="py-2 pr-4 font-semibold">
                  {t('pdp.food.typicalValues')}
                </th>
                <th scope="col" className="py-2 text-right font-semibold">
                  {unit === 'ml' ? t('pdp.food.per100ml') : t('pdp.food.per100g')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              <tr>
                <th scope="row" className="py-2 pr-4 font-semibold">
                  {t('pdp.food.energy')}
                </th>
                <td className="py-2 text-right">
                  {t('pdp.food.energyValue', {
                    kj: fmt.number(nutrition.energyKj),
                    kcal: fmt.number(nutrition.energyKcal),
                  })}
                </td>
              </tr>
              {NUTRITION_ROWS.map(({ key, indent }) => (
                <tr key={key}>
                  <th
                    scope="row"
                    className={indent ? 'py-2 pl-5 pr-4 font-normal' : 'py-2 pr-4 font-semibold'}
                  >
                    {t(ROW_LABELS[key])}
                  </th>
                  <td className="py-2 text-right">
                    {t('pdp.food.grams', { value: formatTenths(nutrition[key], decimal) })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section aria-labelledby="ingredients-heading">
        <h3 id="ingredients-heading" className="font-display text-xl font-bold">
          {t('pdp.food.ingredientsHeading')}
        </h3>
        {ingredients ? (
          <>
            <p data-testid="ingredients" className="mt-2 break-words">
              {parseIngredients(ingredients).map((part, i) =>
                part.allergen ? (
                  <strong key={i}>{part.text}</strong>
                ) : (
                  <span key={i}>{part.text}</span>
                ),
              )}
            </p>
            {allergens.length > 0 && (
              <p className="mt-1 text-sm text-muted">{t('pdp.food.ingredientsNote')}</p>
            )}
          </>
        ) : (
          <p className="mt-2 text-muted">{t('pdp.food.noIngredients')}</p>
        )}
      </section>

      <section aria-labelledby="allergens-heading">
        <h3 id="allergens-heading" className="font-display text-xl font-bold">
          {t('pdp.food.allergensHeading')}
        </h3>
        <p data-testid="allergens" className="mt-2">
          {allergens.length > 0 ? (
            <>
              {t('pdp.food.contains')}{' '}
              <strong>{allergens.map((a) => labels.allergen(a)).join(', ')}</strong>
            </>
          ) : (
            t('pdp.food.noAllergens')
          )}
        </p>
      </section>
    </div>
  );
}
