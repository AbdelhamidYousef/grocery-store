import type { AdminSizeGuide, AdminSizeGuideInput } from '@store/shared';
import { AdminSizeGuideInputSchema } from '@store/shared';
import { useState } from 'react';

import { Seo } from '../../../components/Seo';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Skeleton } from '../../../components/ui/Skeleton';
import { Textarea } from '../../../components/ui/Textarea';
import { useToast } from '../../../components/ui/Toast';
import { FormAlert } from '../../auth/AuthCard';
import { adminErrorMessage } from '../errors';

import { moveItem, RowControls } from './EditorList';
import {
  useAdminSizeGuides,
  useCreateSizeGuide,
  useDeleteSizeGuide,
  useUpdateSizeGuide,
} from './queries';

// The size guide library: one chart serves many products (every harness shares one). A guide's
// rows are free text per column, keyed by the size option a variant carries ("M") so the product
// page can highlight the row of the selected variant.

interface GuideForm {
  slug: string;
  title: string;
  columns: string[];
  rows: { size: string; label: string; values: string[] }[];
  howtoMd: string;
  tip: string;
}

const emptyForm = (): GuideForm => ({
  slug: '',
  title: '',
  columns: ['Chest (cm)'],
  rows: [{ size: 'S', label: 'Small', values: [''] }],
  howtoMd: '',
  tip: '',
});

const toForm = (g: AdminSizeGuide): GuideForm => ({
  slug: g.slug,
  title: g.title,
  columns: [...g.table.columns],
  rows: g.table.rows.map((r) => ({ ...r, values: [...r.values] })),
  howtoMd: g.howtoMd,
  tip: g.tip ?? '',
});

const toInput = (f: GuideForm): AdminSizeGuideInput => ({
  slug: f.slug,
  title: f.title,
  table: { columns: f.columns, rows: f.rows },
  howtoMd: f.howtoMd,
  tip: f.tip,
});

export function SizeGuidesAdmin() {
  const { data: guides, isPending, isError, refetch } = useAdminSizeGuides();
  const [editing, setEditing] = useState<{ id: string | null; form: GuideForm } | null>(null);

  return (
    <section
      aria-labelledby="guides-heading"
      data-testid="admin-size-guides"
      className="flex flex-col gap-4"
    >
      <Seo title="Size guides" noindex />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="guides-heading" className="font-display text-xl font-bold">
          Size guides
        </h2>
        {!editing && (
          <Button onClick={() => setEditing({ id: null, form: emptyForm() })}>
            New size guide
          </Button>
        )}
      </div>
      {editing ? (
        <GuideEditor
          key={editing.id ?? 'new'}
          id={editing.id}
          initial={editing.form}
          onDone={() => setEditing(null)}
        />
      ) : isError ? (
        <div role="alert" className="text-danger">
          We could not load the size guides.{' '}
          <Button variant="secondary" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : isPending ? (
        <Skeleton className="h-32 w-full rounded-card" />
      ) : guides.length === 0 ? (
        <p className="text-muted">No size guides yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-card border border-line">
          {guides.map((g) => (
            <li
              key={g.id}
              className="flex flex-wrap items-center gap-3 p-3"
              data-testid="admin-size-guide-row"
            >
              <span className="min-w-0 flex-1 break-words font-semibold">{g.title}</span>
              <span className="text-sm text-muted">
                {g.slug} · {g.productCount} {g.productCount === 1 ? 'product' : 'products'}
              </span>
              <Button variant="secondary" onClick={() => setEditing({ id: g.id, form: toForm(g) })}>
                Edit <span className="sr-only">{g.title}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function GuideEditor({
  id,
  initial,
  onDone,
}: {
  id: string | null;
  initial: GuideForm;
  onDone: () => void;
}) {
  const toast = useToast();
  const create = useCreateSizeGuide();
  const update = useUpdateSizeGuide();
  const remove = useDeleteSizeGuide();
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [alert, setAlert] = useState<string | null>(null);
  const pending = create.isPending || update.isPending;

  const setColumns = (columns: string[]) =>
    setForm({
      ...form,
      columns,
      // Rows keep exactly one value per column.
      rows: form.rows.map((r) => ({
        ...r,
        values: columns.map((_, i) => r.values[i] ?? ''),
      })),
    });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setAlert(null);
    const parsed = AdminSizeGuideInputSchema.safeParse(toInput(form));
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[issue.path.join('.')] ??= issue.message;
      setErrors(next);
      setAlert('Some fields need attention.');
      return;
    }
    setErrors({});
    const done = {
      onSuccess: () => {
        toast.show('Size guide saved', 'success');
        onDone();
      },
      onError: (err: unknown) => setAlert(adminErrorMessage(err)),
    };
    if (id) update.mutate({ id, input: toInput(form) }, done);
    else create.mutate(toInput(form), done);
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-4"
      data-testid="size-guide-form"
    >
      <FormAlert message={alert} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          label="Title"
          value={form.title}
          error={errors.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
        <Input
          label="Slug"
          hint="Lower-case, dashes."
          value={form.slug}
          error={errors.slug}
          onChange={(e) => setForm({ ...form, slug: e.target.value })}
        />
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="font-display font-bold">Columns</legend>
        <ul className="flex flex-col gap-2">
          {form.columns.map((col, i) => (
            <li key={i} className="flex flex-wrap items-end gap-2">
              <Input
                label={`Column ${i + 1}`}
                value={col}
                error={errors[`table.columns.${i}`]}
                onChange={(e) =>
                  setColumns(form.columns.map((c, j) => (j === i ? e.target.value : c)))
                }
              />
              <Button
                type="button"
                variant="ghost"
                disabled={form.columns.length === 1}
                onClick={() => setColumns(form.columns.filter((_, j) => j !== i))}
              >
                Remove column {i + 1}
              </Button>
            </li>
          ))}
        </ul>
        <div>
          <Button
            type="button"
            variant="secondary"
            disabled={form.columns.length >= 8}
            onClick={() => setColumns([...form.columns, ''])}
          >
            Add a column
          </Button>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="font-display font-bold">Rows</legend>
        <ul className="flex flex-col gap-3">
          {form.rows.map((row, i) => (
            <li key={i} className="flex flex-col gap-2 rounded-card border border-line p-3">
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label={`Row ${i + 1} size code`}
                  hint="The variant's size option, e.g. M"
                  value={row.size}
                  error={errors[`table.rows.${i}.size`]}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      rows: form.rows.map((r, j) => (j === i ? { ...r, size: e.target.value } : r)),
                    })
                  }
                />
                <Input
                  label={`Row ${i + 1} name`}
                  value={row.label}
                  error={errors[`table.rows.${i}.label`]}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      rows: form.rows.map((r, j) =>
                        j === i ? { ...r, label: e.target.value } : r,
                      ),
                    })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                {form.columns.map((col, c) => (
                  <Input
                    key={c}
                    label={`Row ${i + 1}, ${col || `column ${c + 1}`}`}
                    value={row.values[c] ?? ''}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        rows: form.rows.map((r, j) =>
                          j === i
                            ? {
                                ...r,
                                values: r.values.map((v, k) => (k === c ? e.target.value : v)),
                              }
                            : r,
                        ),
                      })
                    }
                  />
                ))}
              </div>
              {errors[`table.rows.${i}.values`] && (
                <p role="alert" className="text-sm font-semibold text-danger">
                  {errors[`table.rows.${i}.values`]}
                </p>
              )}
              <RowControls
                noun="row"
                index={i}
                count={form.rows.length}
                onMove={(from, to) => setForm({ ...form, rows: moveItem(form.rows, from, to) })}
                onRemove={(at) => setForm({ ...form, rows: form.rows.filter((_, j) => j !== at) })}
              />
            </li>
          ))}
        </ul>
        <div>
          <Button
            type="button"
            variant="secondary"
            disabled={form.rows.length >= 20}
            onClick={() =>
              setForm({
                ...form,
                rows: [...form.rows, { size: '', label: '', values: form.columns.map(() => '') }],
              })
            }
          >
            Add a row
          </Button>
        </div>
      </fieldset>

      <Textarea
        label="How to measure"
        hint="One step per line, numbered like 1. Measure the chest."
        value={form.howtoMd}
        error={errors.howtoMd}
        onChange={(e) => setForm({ ...form, howtoMd: e.target.value })}
      />
      <Input
        label="Tip (optional)"
        hint="Shown under the table, e.g. In between sizes? Size up."
        value={form.tip}
        error={errors.tip}
        onChange={(e) => setForm({ ...form, tip: e.target.value })}
      />

      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={pending}>
          Save size guide
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        {id && (
          <Button
            type="button"
            variant="danger"
            loading={remove.isPending}
            onClick={() => {
              if (!window.confirm('Delete this size guide? Products using it lose their guide.'))
                return;
              remove.mutate(id, {
                onSuccess: () => {
                  toast.show('Size guide deleted', 'success');
                  onDone();
                },
                onError: (err) => setAlert(adminErrorMessage(err)),
              });
            }}
          >
            Delete size guide
          </Button>
        )}
      </div>
    </form>
  );
}
