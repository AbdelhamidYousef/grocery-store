import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Textarea } from '../../../components/ui/Textarea';

import type { ContentForm, FormErrors } from './content-form';
import { EditorSection, moveItem, RowControls } from './EditorList';

interface Props {
  form: ContentForm;
  errors: FormErrors;
  onChange: (next: ContentForm) => void;
}

// Specs: label and value pairs shown as a table on the product page.
export function SpecsEditor({ form, errors, onChange }: Props) {
  const set = (specs: ContentForm['specs']) => onChange({ ...form, specs });
  return (
    <EditorSection
      title="Specifications"
      hint="Shown as a table in the Specs tab. Labels must be different from each other."
    >
      <ul className="flex flex-col gap-4">
        {form.specs.map((spec, i) => (
          <li key={i} className="flex flex-col gap-2 rounded-card border border-line p-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label={`Spec ${i + 1} label`}
                value={spec.label}
                error={errors[`specs.${i}.label`]}
                onChange={(e) =>
                  set(form.specs.map((s, j) => (j === i ? { ...s, label: e.target.value } : s)))
                }
              />
              <Input
                label={`Spec ${i + 1} value`}
                value={spec.value}
                error={errors[`specs.${i}.value`]}
                onChange={(e) =>
                  set(form.specs.map((s, j) => (j === i ? { ...s, value: e.target.value } : s)))
                }
              />
            </div>
            <RowControls
              noun="spec"
              index={i}
              count={form.specs.length}
              onMove={(from, to) => set(moveItem(form.specs, from, to))}
              onRemove={(at) => set(form.specs.filter((_, j) => j !== at))}
            />
          </li>
        ))}
      </ul>
      <div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => set([...form.specs, { label: '', value: '' }])}
        >
          Add a spec
        </Button>
      </div>
    </EditorSection>
  );
}

// FAQ: static question and answer pairs, in the order the shopper reads them.
export function FaqEditor({ form, errors, onChange }: Props) {
  const set = (faqs: ContentForm['faqs']) => onChange({ ...form, faqs });
  return (
    <EditorSection
      title="Questions and answers"
      hint="Written by you, shown as an accordion under the Specs tab and in the page's search data."
    >
      <ul className="flex flex-col gap-4">
        {form.faqs.map((faq, i) => (
          <li key={i} className="flex flex-col gap-2 rounded-card border border-line p-3">
            <Input
              label={`Question ${i + 1}`}
              value={faq.question}
              error={errors[`faqs.${i}.question`]}
              onChange={(e) =>
                set(form.faqs.map((f, j) => (j === i ? { ...f, question: e.target.value } : f)))
              }
            />
            <Textarea
              label={`Answer ${i + 1}`}
              rows={3}
              value={faq.answer}
              error={errors[`faqs.${i}.answer`]}
              onChange={(e) =>
                set(form.faqs.map((f, j) => (j === i ? { ...f, answer: e.target.value } : f)))
              }
            />
            <RowControls
              noun="question"
              index={i}
              count={form.faqs.length}
              onMove={(from, to) => set(moveItem(form.faqs, from, to))}
              onRemove={(at) => set(form.faqs.filter((_, j) => j !== at))}
            />
          </li>
        ))}
      </ul>
      <div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => set([...form.faqs, { question: '', answer: '' }])}
        >
          Add a question
        </Button>
      </div>
    </EditorSection>
  );
}
