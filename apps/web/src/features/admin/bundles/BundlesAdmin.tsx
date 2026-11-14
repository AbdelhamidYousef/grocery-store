import {
  AdminBundleCreateSchema,
  AdminBundleUpdateSchema,
  bundleSavingCents,
  formatMoney,
  type AdminBundle,
} from '@store/shared';
import { useState } from 'react';

import { Seo } from '../../../components/Seo';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Skeleton } from '../../../components/ui/Skeleton';
import { Textarea } from '../../../components/ui/Textarea';
import { useToast } from '../../../components/ui/Toast';
import { FormAlert } from '../../auth/AuthCard';
import { adminErrorMessage } from '../errors';
import { centsToInput, inputToCents } from '../money-input';

import {
  useAdminBundles,
  useArchiveBundle,
  useBundleVariants,
  useCreateBundle,
  useUpdateBundle,
} from './queries';

// Kits: a bundle is one product with one variant; its price is that variant's price. The editor
// shows the saving live (parts cost minus the kit price) so a kit that is not a deal is obvious
// before the server refuses it.

interface Part {
  variantId: string;
  label: string;
  priceCents: number;
  qty: number;
}
interface BundleForm {
  name: string;
  slug: string;
  description: string;
  price: string;
  parts: Part[];
}

const emptyForm = (): BundleForm => ({ name: '', slug: '', description: '', price: '', parts: [] });
const toForm = (b: AdminBundle): BundleForm => ({
  name: b.name,
  slug: b.slug,
  description: '',
  price: centsToInput(b.priceCents),
  parts: b.components.map((c) => ({
    variantId: c.variantId,
    label: `${c.productName} (${c.variantName})`,
    priceCents: c.priceCents,
    qty: c.qty,
  })),
});

export function BundlesAdmin() {
  const { data: bundles, isPending, isError, refetch } = useAdminBundles();
  const [editing, setEditing] = useState<{ bundle: AdminBundle | null } | null>(null);
  const archive = useArchiveBundle();
  const toast = useToast();

  return (
    <section
      aria-labelledby="bundles-heading"
      data-testid="admin-bundles"
      className="flex flex-col gap-4"
    >
      <Seo title="Kits" noindex />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="bundles-heading" className="font-display text-xl font-bold">
          Kits and bundles
        </h2>
        {!editing && <Button onClick={() => setEditing({ bundle: null })}>New kit</Button>}
      </div>
      {editing ? (
        <BundleEditor
          key={editing.bundle?.variantId ?? 'new'}
          bundle={editing.bundle}
          onDone={() => setEditing(null)}
        />
      ) : isError ? (
        <div role="alert" className="text-danger">
          We could not load the kits.{' '}
          <Button variant="secondary" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : isPending ? (
        <Skeleton className="h-32 w-full rounded-card" />
      ) : bundles.length === 0 ? (
        <p className="text-muted">No kits yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-card border border-line">
          {bundles.map((b) => (
            <li
              key={b.variantId}
              className="flex flex-wrap items-center gap-3 p-3"
              data-testid="admin-bundle-row"
            >
              <span className="min-w-0 flex-1 break-words">
                <span className="font-semibold">{b.name}</span>
                <span className="block text-sm text-muted">
                  {b.components.length} parts · {formatMoney(b.priceCents, 'EUR')} · saves{' '}
                  {formatMoney(b.savingCents, 'EUR')} · {b.available} can be made
                </span>
              </span>
              <Button variant="secondary" onClick={() => setEditing({ bundle: b })}>
                Edit <span className="sr-only">{b.name}</span>
              </Button>
              <Button
                variant="ghost"
                loading={archive.isPending && archive.variables === b.variantId}
                onClick={() =>
                  archive.mutate(b.variantId, {
                    onSuccess: () => toast.show('Kit archived', 'success'),
                    onError: (err) => toast.show(adminErrorMessage(err), 'error'),
                  })
                }
              >
                Archive <span className="sr-only">{b.name}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BundleEditor({ bundle, onDone }: { bundle: AdminBundle | null; onDone: () => void }) {
  const toast = useToast();
  const create = useCreateBundle();
  const update = useUpdateBundle();
  const [form, setForm] = useState<BundleForm>(bundle ? toForm(bundle) : emptyForm());
  const [search, setSearch] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [alert, setAlert] = useState<string | null>(null);
  const options = useBundleVariants(search);
  const pending = create.isPending || update.isPending;

  const priceCents = inputToCents(form.price);
  const preview = bundleSavingCents(
    priceCents ?? 0,
    form.parts.map((p) => ({ priceCents: p.priceCents, qty: p.qty })),
  );
  const notADeal =
    priceCents !== null && form.parts.length > 0 && priceCents >= preview.individualCents;

  const setPart = (i: number, patch: Partial<Part>) =>
    setForm({ ...form, parts: form.parts.map((p, j) => (j === i ? { ...p, ...patch } : p)) });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setAlert(null);
    const components = form.parts.map((p) => ({ variantId: p.variantId, qty: p.qty }));
    const payload = bundle
      ? { priceCents: priceCents ?? 0, components }
      : {
          name: form.name,
          slug: form.slug,
          description: form.description,
          priceCents: priceCents ?? 0,
          components,
        };
    const parsed = (bundle ? AdminBundleUpdateSchema : AdminBundleCreateSchema).safeParse(payload);
    if (!parsed.success || priceCents === null) {
      const next: Record<string, string> = {};
      if (priceCents === null) next.priceCents = 'Enter a price like 12.99';
      if (!parsed.success) {
        for (const issue of parsed.error.issues) next[issue.path.join('.')] ??= issue.message;
      }
      setErrors(next);
      setAlert('Some fields need attention.');
      return;
    }
    setErrors({});
    const done = {
      onSuccess: () => {
        toast.show('Kit saved', 'success');
        onDone();
      },
      onError: (err: unknown) => setAlert(adminErrorMessage(err)),
    };
    if (bundle) {
      update.mutate(
        {
          variantId: bundle.variantId,
          input: payload,
        },
        done,
      );
    } else {
      create.mutate(payload as Parameters<typeof create.mutate>[0], done);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4" data-testid="bundle-form">
      <FormAlert message={alert} />
      {!bundle && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="Name"
              value={form.name}
              error={errors.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Input
              label="Slug"
              hint="Lower-case, dashes."
              value={form.slug}
              error={errors.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
            />
          </div>
          <Textarea
            label="Description"
            value={form.description}
            error={errors.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </>
      )}

      <fieldset className="flex flex-col gap-3">
        <legend className="font-display font-bold">Parts</legend>
        {errors.components && <p className="text-danger">{errors.components}</p>}
        <ul className="flex flex-col gap-2">
          {form.parts.map((p, i) => (
            <li key={p.variantId} className="flex flex-wrap items-end gap-2">
              <span className="min-w-0 flex-1 break-words">
                {p.label}
                <span className="block text-sm text-muted">
                  {formatMoney(p.priceCents, 'EUR')} each
                </span>
                {errors[`components.${i}.variantId`] && (
                  <span className="block text-sm text-danger">
                    {errors[`components.${i}.variantId`]}
                  </span>
                )}
              </span>
              <Input
                label={`Quantity of ${p.label}`}
                type="number"
                min={1}
                max={20}
                value={p.qty}
                error={errors[`components.${i}.qty`]}
                onChange={(e) => setPart(i, { qty: Number(e.target.value) })}
              />
              <Button
                type="button"
                variant="ghost"
                onClick={() => setForm({ ...form, parts: form.parts.filter((_, j) => j !== i) })}
              >
                Remove <span className="sr-only">{p.label}</span>
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-end gap-2">
          <Input
            label="Find a variant"
            hint="Name or SKU"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            label="Add a part"
            value=""
            disabled={form.parts.length >= 8}
            onChange={(e) => {
              const found = options.data?.find((o) => o.variantId === e.target.value);
              if (found && !form.parts.some((p) => p.variantId === found.variantId)) {
                setForm({
                  ...form,
                  parts: [
                    ...form.parts,
                    {
                      variantId: found.variantId,
                      label: found.label,
                      priceCents: found.priceCents,
                      qty: 1,
                    },
                  ],
                });
              }
            }}
          >
            <option value="">Choose a variant</option>
            {(options.data ?? []).map((o) => (
              <option key={o.variantId} value={o.variantId}>
                {o.label} - {formatMoney(o.priceCents, 'EUR')}
              </option>
            ))}
          </Select>
        </div>
      </fieldset>

      <Input
        label="Kit price (EUR)"
        inputMode="decimal"
        value={form.price}
        error={errors.priceCents}
        onChange={(e) => setForm({ ...form, price: e.target.value })}
      />
      <p
        data-testid="bundle-preview"
        className={notADeal ? 'font-semibold text-danger' : 'text-muted'}
        aria-live="polite"
      >
        Parts cost {formatMoney(preview.individualCents, 'EUR')} separately.{' '}
        {notADeal
          ? 'The kit price must be lower than that.'
          : `The kit saves ${formatMoney(preview.savingCents, 'EUR')}.`}
      </p>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={pending}>
          Save kit
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
