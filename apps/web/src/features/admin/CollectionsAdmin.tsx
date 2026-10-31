import type { AdminCollection } from '@store/shared';
import { useState } from 'react';

import { Seo } from '../../components/Seo';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { Dialog } from '../../components/ui/Dialog';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { FormAlert } from '../auth/AuthCard';

import { adminErrorMessage } from './errors';
import {
  useAdminCollections,
  useCreateCollection,
  useDeleteCollection,
  useSetCollectionProducts,
  useUpdateCollection,
} from './merch-queries';
import { useAdminProducts } from './queries';

type Status = 'Live' | 'Off' | 'Scheduled' | 'Ended';

// What an editor wants to know at a glance; the shop itself only needs `isLive`.
export function collectionStatus(c: AdminCollection, now = new Date()): Status {
  if (!c.isActive) return 'Off';
  if (c.startsAt && new Date(c.startsAt) > now) return 'Scheduled';
  if (c.endsAt && new Date(c.endsAt) <= now) return 'Ended';
  return 'Live';
}

// <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" and has no timezone, so the form works in
// UTC and says so; the API stores real instants.
const toInput = (iso: string | null) => (iso ? iso.slice(0, 16) : '');
const fromInput = (value: string) => (value ? new Date(`${value}:00Z`).toISOString() : null);

function DetailsForm({
  collection,
  onSaved,
  onCancel,
}: {
  collection: AdminCollection | undefined;
  onSaved: (saved: AdminCollection) => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const create = useCreateCollection();
  const update = useUpdateCollection();
  const [form, setForm] = useState({
    slug: collection?.slug ?? '',
    name: collection?.name ?? '',
    description: collection?.description ?? '',
    accentColor: collection?.accentColor.toLowerCase() ?? '#8b5cf6',
    startsAt: toInput(collection?.startsAt ?? null),
    endsAt: toInput(collection?.endsAt ?? null),
    isActive: collection?.isActive ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const set =
    (key: 'slug' | 'name' | 'description' | 'accentColor' | 'startsAt' | 'endsAt') =>
    (e: { target: { value: string } }) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const base = {
      name: form.name,
      description: form.description,
      accentColor: form.accentColor,
      startsAt: fromInput(form.startsAt),
      endsAt: fromInput(form.endsAt),
      isActive: form.isActive,
    };
    const options = {
      onSuccess: (saved: AdminCollection) => {
        toast.show(collection ? 'Collection saved' : 'Collection created', 'success');
        onSaved(saved);
      },
      onError: (err: unknown) => setError(adminErrorMessage(err)),
    };
    if (collection) update.mutate({ id: collection.id, input: base }, options);
    else create.mutate({ ...base, slug: form.slug }, options);
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      data-testid="admin-collection-form"
      className="flex flex-col gap-4"
    >
      <FormAlert message={error} />
      <Input label="Name" value={form.name} onChange={set('name')} />
      <Input
        label="Slug"
        hint={
          collection
            ? 'The slug cannot change: it is in the public address.'
            : 'Lower-case, for example halloween'
        }
        value={form.slug}
        onChange={set('slug')}
        disabled={collection !== undefined}
      />
      <Input label="Description" value={form.description} onChange={set('description')} />
      <Input
        label="Accent colour"
        type="color"
        value={form.accentColor}
        onChange={set('accentColor')}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          label="Starts (UTC)"
          type="datetime-local"
          hint="Leave empty to start now"
          value={form.startsAt}
          onChange={set('startsAt')}
        />
        <Input
          label="Ends (UTC)"
          type="datetime-local"
          hint="Leave empty to never end"
          value={form.endsAt}
          onChange={set('endsAt')}
        />
      </div>
      <Checkbox
        label="Switched on"
        checked={form.isActive}
        onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
      />
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="secondary" onClick={onCancel}>
          Close
        </Button>
        <Button type="submit" loading={create.isPending || update.isPending}>
          {collection ? 'Save details' : 'Create collection'}
        </Button>
      </div>
    </form>
  );
}

type Member = AdminCollection['products'][number];

// The ordered product list. Order is edited with up/down buttons (keyboard and touch friendly,
// no drag library) and saved as one list: the API replaces the old order wholesale.
function ProductPicker({ collection }: { collection: AdminCollection }) {
  const toast = useToast();
  const save = useSetCollectionProducts();
  const [members, setMembers] = useState<Member[]>(collection.products);
  const [q, setQ] = useState('');
  const { data: found } = useAdminProducts({ q, limit: 8 });
  const dirty = members.map((m) => m.id).join() !== collection.productIds.join();

  const move = (index: number, by: -1 | 1) =>
    setMembers((list) => {
      const next = [...list];
      const target = index + by;
      if (target < 0 || target >= next.length) return list;
      [next[index], next[target]] = [next[target] as Member, next[index] as Member];
      return next;
    });

  return (
    <section
      aria-labelledby="coll-products"
      className="flex flex-col gap-3"
      data-testid="collection-products"
    >
      <h3 id="coll-products" className="font-display text-lg font-bold">
        Products in this collection ({members.length})
      </h3>
      {members.length === 0 ? (
        <p className="text-muted">Nothing here yet. Search below to add products.</p>
      ) : (
        <ol className="flex max-h-72 flex-col overflow-y-auto rounded-card border border-line">
          {members.map((m, i) => (
            <li
              key={m.id}
              data-testid="collection-member"
              className="flex items-center gap-2 border-b border-line p-2 last:border-b-0"
            >
              <span className="w-7 text-right text-sm text-muted">{i + 1}.</span>
              <span className="min-w-0 flex-1 break-words">{m.name}</span>
              <Button variant="secondary" disabled={i === 0} onClick={() => move(i, -1)}>
                <span aria-hidden="true">&uarr;</span>
                <span className="sr-only">Move {m.name} up</span>
              </Button>
              <Button
                variant="secondary"
                disabled={i === members.length - 1}
                onClick={() => move(i, 1)}
              >
                <span aria-hidden="true">&darr;</span>
                <span className="sr-only">Move {m.name} down</span>
              </Button>
              <Button
                variant="secondary"
                onClick={() => setMembers((list) => list.filter((x) => x.id !== m.id))}
              >
                Remove <span className="sr-only">{m.name}</span>
              </Button>
            </li>
          ))}
        </ol>
      )}
      <Input
        label="Find a product to add"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Name or SKU"
      />
      <ul className="flex flex-col">
        {found?.data
          .filter((p) => !members.some((m) => m.id === p.id))
          .map((p) => (
            <li key={p.id} className="flex items-center gap-2 py-1">
              <span className="min-w-0 flex-1 break-words">{p.name}</span>
              <Button
                variant="secondary"
                onClick={() =>
                  setMembers((list) => [...list, { id: p.id, name: p.name, slug: p.slug }])
                }
              >
                Add <span className="sr-only">{p.name}</span>
              </Button>
            </li>
          ))}
      </ul>
      <div className="flex justify-end">
        <Button
          disabled={!dirty}
          loading={save.isPending}
          onClick={() =>
            save.mutate(
              { id: collection.id, productIds: members.map((m) => m.id) },
              {
                onSuccess: () => toast.show('Collection products saved', 'success'),
                onError: (err) => toast.show(adminErrorMessage(err), 'error'),
              },
            )
          }
        >
          Save products and order
        </Button>
      </div>
    </section>
  );
}

export function CollectionsAdmin() {
  const { data: collections, isPending, isError, refetch } = useAdminCollections();
  const remove = useDeleteCollection();
  const toast = useToast();
  // Holds the id (not the object) so the dialog always shows the freshest copy after a save.
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing =
    editingId && editingId !== 'new' ? collections?.find((c) => c.id === editingId) : undefined;

  return (
    <section
      aria-labelledby="collections-heading"
      data-testid="admin-collections"
      className="flex flex-col gap-4"
    >
      <Seo title="Collections" noindex />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="collections-heading" className="font-display text-xl font-bold">
          Collections
        </h2>
        <Button onClick={() => setEditingId('new')}>New collection</Button>
      </div>
      {isError ? (
        <div role="alert" className="text-danger">
          We could not load the collections.{' '}
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
                <th className="p-3">Status</th>
                <th className="p-3">Products</th>
                <th className="p-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {collections.map((c) => (
                <tr key={c.id} className="border-t border-line" data-testid="admin-collection-row">
                  <td className="p-3 font-semibold">
                    {c.name}
                    <span className="block text-sm font-normal text-muted">{c.slug}</span>
                  </td>
                  <td className="p-3" data-testid="collection-status">
                    {collectionStatus(c)}
                  </td>
                  <td className="p-3">{c.productCount}</td>
                  <td className="flex flex-wrap justify-end gap-2 p-3">
                    <Button variant="secondary" onClick={() => setEditingId(c.id)}>
                      Edit <span className="sr-only">{c.name}</span>
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        if (!window.confirm(`Delete ${c.name}? The products stay in the shop.`))
                          return;
                        remove.mutate(c.id, {
                          onSuccess: () => toast.show('Collection deleted', 'success'),
                          onError: (err) => toast.show(adminErrorMessage(err), 'error'),
                        });
                      }}
                    >
                      Delete <span className="sr-only">{c.name}</span>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialog
        open={editingId !== null}
        onClose={() => setEditingId(null)}
        title={editing ? `Edit ${editing.name}` : 'New collection'}
        className="max-w-2xl"
      >
        {editingId !== null && (
          <div className="flex flex-col gap-8">
            {/* Keyed so a freshly created collection reopens its own form and picker. */}
            <DetailsForm
              key={editing?.id ?? 'new'}
              collection={editing}
              onSaved={(saved) => setEditingId(editing ? null : saved.id)}
              onCancel={() => setEditingId(null)}
            />
            {editing && (
              <ProductPicker
                key={`${editing.id}-${editing.productIds.join()}`}
                collection={editing}
              />
            )}
          </div>
        )}
      </Dialog>
    </section>
  );
}
