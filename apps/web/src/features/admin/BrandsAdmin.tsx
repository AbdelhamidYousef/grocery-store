import { AdminBrandInputSchema, type Brand } from '@store/shared';
import { useState } from 'react';

import { Seo } from '../../components/Seo';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { Textarea } from '../../components/ui/Textarea';
import { useToast } from '../../components/ui/Toast';
import { FormAlert } from '../auth/AuthCard';

import { adminErrorMessage } from './errors';
import { useAdminBrands, useCreateBrand, useDeleteBrand, useUpdateBrand } from './merch-queries';

const empty = { slug: '', name: '', tagline: '', story: '', accentColor: '#f59e0b' };

function BrandForm({ brand, onDone }: { brand: Brand | undefined; onDone: () => void }) {
  const toast = useToast();
  const create = useCreateBrand();
  const update = useUpdateBrand();
  const [form, setForm] = useState(
    brand ? { ...brand, accentColor: brand.accentColor.toLowerCase() } : empty,
  );
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof empty) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = AdminBrandInputSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('. '));
      return;
    }
    const options = {
      onSuccess: () => {
        toast.show(brand ? 'Brand saved' : 'Brand created', 'success');
        onDone();
      },
      onError: (err: unknown) => setError(adminErrorMessage(err)),
    };
    if (brand) {
      // The slug is fixed after creation, so it is not part of an update.
      update.mutate(
        {
          id: brand.id,
          input: {
            name: parsed.data.name,
            tagline: parsed.data.tagline,
            story: parsed.data.story,
            accentColor: parsed.data.accentColor,
          },
        },
        options,
      );
    } else create.mutate(parsed.data, options);
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      data-testid="admin-brand-form"
      className="flex flex-col gap-4"
    >
      <FormAlert message={error} />
      <Input label="Name" value={form.name} onChange={set('name')} />
      <Input
        label="Slug"
        hint={
          brand
            ? 'The slug cannot change: it is in the public address.'
            : 'Lower-case, for example scaleby'
        }
        value={form.slug}
        onChange={set('slug')}
        disabled={brand !== undefined}
      />
      <Input label="Tagline" value={form.tagline} onChange={set('tagline')} />
      <Textarea label="Story" rows={4} value={form.story} onChange={set('story')} />
      <Input
        label="Accent colour"
        type="color"
        value={form.accentColor}
        onChange={set('accentColor')}
      />
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={create.isPending || update.isPending}>
          {brand ? 'Save brand' : 'Create brand'}
        </Button>
      </div>
    </form>
  );
}

export function BrandsAdmin() {
  const { data: brands, isPending, isError, refetch } = useAdminBrands();
  const remove = useDeleteBrand();
  const toast = useToast();
  const [editing, setEditing] = useState<Brand | 'new' | null>(null);

  return (
    <section
      aria-labelledby="brands-heading"
      data-testid="admin-brands"
      className="flex flex-col gap-4"
    >
      <Seo title="Brands" noindex />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="brands-heading" className="font-display text-xl font-bold">
          Brands
        </h2>
        <Button onClick={() => setEditing('new')}>New brand</Button>
      </div>
      {isError ? (
        <div role="alert" className="text-danger">
          We could not load the brands.{' '}
          <Button variant="secondary" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : isPending ? (
        <Skeleton className="h-40 w-full rounded-card" />
      ) : (
        <div className="overflow-x-auto rounded-card border border-line">
          <table className="w-full text-left">
            <thead className="bg-bg text-sm">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Slug</th>
                <th className="p-3">Products</th>
                <th className="p-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {brands.map((b) => (
                <tr key={b.id} className="border-t border-line" data-testid="admin-brand-row">
                  <td className="p-3 font-semibold">
                    <span
                      aria-hidden="true"
                      className="mr-2 inline-block size-3 rounded-full"
                      style={{ backgroundColor: b.accentColor }}
                    />
                    {b.name}
                  </td>
                  <td className="p-3 text-muted">{b.slug}</td>
                  <td className="p-3">{b.productCount}</td>
                  <td className="flex flex-wrap justify-end gap-2 p-3">
                    <Button variant="secondary" onClick={() => setEditing(b)}>
                      Edit <span className="sr-only">{b.name}</span>
                    </Button>
                    <Button
                      variant="secondary"
                      loading={remove.isPending && remove.variables === b.id}
                      onClick={() => {
                        if (
                          !window.confirm(`Delete ${b.name}? Its products stay, without a brand.`)
                        )
                          return;
                        remove.mutate(b.id, {
                          onSuccess: () => toast.show('Brand deleted', 'success'),
                          onError: (err) => toast.show(adminErrorMessage(err), 'error'),
                        });
                      }}
                    >
                      Delete <span className="sr-only">{b.name}</span>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' || editing === null ? 'New brand' : `Edit ${editing.name}`}
        className="max-w-xl"
      >
        {editing !== null && (
          <BrandForm
            brand={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Dialog>
    </section>
  );
}
