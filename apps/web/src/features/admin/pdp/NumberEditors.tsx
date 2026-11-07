import { findBandProblems, LIFE_STAGES, type LifeStage } from '@store/shared';

import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';

import { kgToGrams, PERCENT_KEYS, type ContentForm, type FormErrors } from './content-form';
import { EditorSection, moveItem, RowControls } from './EditorList';

interface Props {
  form: ContentForm;
  errors: FormErrors;
  onChange: (next: ContentForm) => void;
}

const STAGE_LABEL: Record<LifeStage, string> = {
  any: 'All life stages',
  puppy: 'Puppy or kitten',
  adult: 'Adult',
  senior: 'Senior',
};

// Percent inputs: the form shows percent, the API stores basis points (see content-form.ts).
export function ConstituentsEditor({
  form,
  errors,
  onChange,
  variantNames,
}: Props & { variantNames: Record<string, string> }) {
  const patch = (i: number, field: string, value: string) =>
    onChange({
      ...form,
      constituents: form.constituents.map((c, j) => (j === i ? { ...c, [field]: value } : c)),
    });
  return (
    <EditorSection
      title="Guaranteed analysis per 100 g"
      hint="Percent with up to two decimals (26.5), and energy in kcal. Leave a box empty to leave it out. Toys have none."
    >
      <ul className="flex flex-col gap-4">
        {form.constituents.map((row, i) => (
          <li
            key={row.variantId}
            className="flex flex-col gap-2 rounded-card border border-line p-3"
          >
            <p className="break-words font-semibold">{variantNames[row.variantId] ?? 'Variant'}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {PERCENT_KEYS.map((key) => (
                <Input
                  key={key}
                  label={`${variantNames[row.variantId] ?? 'Variant'} ${key} (%)`}
                  inputMode="decimal"
                  value={row[key]}
                  error={errors[`constituents.${i}.${key}`]}
                  onChange={(e) => patch(i, key, e.target.value)}
                />
              ))}
              <Input
                label={`${variantNames[row.variantId] ?? 'Variant'} energy (kcal)`}
                inputMode="numeric"
                value={row.kcal}
                error={errors[`constituents.${i}.kcal`]}
                onChange={(e) => patch(i, 'kcal', e.target.value)}
              />
            </div>
          </li>
        ))}
      </ul>
    </EditorSection>
  );
}

// The feeding table with the gap and overlap check running as the admin types: the same
// `findBandProblems` the API uses, so the form can never accept what the API would refuse.
export function FeedingEditor({ form, errors, onChange }: Props) {
  const set = (feeding: ContentForm['feeding']) => onChange({ ...form, feeding });
  const live = (() => {
    const rows = form.feeding.map((r) => ({
      petWeightGMin: kgToGrams(r.minKg),
      petWeightGMax: kgToGrams(r.maxKg),
      lifeStage: r.lifeStage,
    }));
    if (rows.some((r) => r.petWeightGMin === null || r.petWeightGMax === null)) return {};
    const problems = findBandProblems(
      rows.map((r) => ({
        petWeightGMin: r.petWeightGMin ?? 0,
        petWeightGMax: r.petWeightGMax ?? 0,
        lifeStage: r.lifeStage,
      })),
    );
    return Object.fromEntries(problems.map((p) => [p.index, p.message]));
  })() as Record<number, string>;

  return (
    <EditorSection
      title="Feeding guide"
      hint="One row per pet weight band, in kg. A band runs up to, but not including, its upper weight, and the next band starts exactly there. Leave empty for products that are not fed."
    >
      <ul className="flex flex-col gap-4">
        {form.feeding.map((row, i) => {
          const problem = errors[`feeding.${i}.minKg`] ?? live[i];
          return (
            <li key={i} className="flex flex-col gap-2 rounded-card border border-line p-3">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Input
                  label={`Band ${i + 1} from (kg)`}
                  inputMode="decimal"
                  value={row.minKg}
                  error={problem}
                  onChange={(e) =>
                    set(form.feeding.map((r, j) => (j === i ? { ...r, minKg: e.target.value } : r)))
                  }
                />
                <Input
                  label={`Band ${i + 1} up to (kg)`}
                  inputMode="decimal"
                  value={row.maxKg}
                  error={errors[`feeding.${i}.maxKg`]}
                  onChange={(e) =>
                    set(form.feeding.map((r, j) => (j === i ? { ...r, maxKg: e.target.value } : r)))
                  }
                />
                <Input
                  label={`Band ${i + 1} grams a day`}
                  inputMode="numeric"
                  value={row.dailyG}
                  error={errors[`feeding.${i}.dailyG`]}
                  onChange={(e) =>
                    set(
                      form.feeding.map((r, j) => (j === i ? { ...r, dailyG: e.target.value } : r)),
                    )
                  }
                />
                <Select
                  label={`Band ${i + 1} life stage`}
                  value={row.lifeStage}
                  onChange={(e) =>
                    set(
                      form.feeding.map((r, j) =>
                        j === i ? { ...r, lifeStage: e.target.value as LifeStage } : r,
                      ),
                    )
                  }
                >
                  {LIFE_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {STAGE_LABEL[s]}
                    </option>
                  ))}
                </Select>
              </div>
              <RowControls
                noun="band"
                index={i}
                count={form.feeding.length}
                onMove={(from, to) => set(moveItem(form.feeding, from, to))}
                onRemove={(at) => set(form.feeding.filter((_, j) => j !== at))}
              />
            </li>
          );
        })}
      </ul>
      <div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            const last = form.feeding.at(-1);
            set([
              ...form.feeding,
              {
                minKg: last?.maxKg ?? '0',
                maxKg: '',
                dailyG: '',
                lifeStage: last?.lifeStage ?? 'any',
              },
            ]);
          }}
        >
          Add a band
        </Button>
      </div>
    </EditorSection>
  );
}
