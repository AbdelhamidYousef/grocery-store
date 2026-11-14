import { Input } from '../../../components/ui/Input';

import { PERCENT_KEYS, type ContentForm, type FormErrors } from './content-form';
import { EditorSection } from './EditorList';

interface Props {
  form: ContentForm;
  errors: FormErrors;
  onChange: (next: ContentForm) => void;
}

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
