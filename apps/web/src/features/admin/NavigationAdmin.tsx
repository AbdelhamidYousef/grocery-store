import {
  AdminMenuPromoInputSchema,
  PET_VALUES,
  type AdminMenuPromo,
  type AdminMenuPromoInput,
} from '@store/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
  createAdminMenuPromo,
  deleteAdminMenuPromo,
  fetchAdminMenuPromos,
  updateAdminMenuPromo,
} from '../../api/admin-navigation';
import { Seo } from '../../components/Seo';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { Dialog } from '../../components/ui/Dialog';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { keys } from '../../lib/query-client';
import { FormAlert } from '../auth/AuthCard';
import { PromoTile } from '../navigation/PromoTile';
import { speciesLabel } from '../pets/age';

import { adminErrorMessage } from './errors';

// ----- data hooks (the same shape as the other admin screens: never trust a cached copy, and a
// write marks the public menu stale too) -----

function useMenuPromos() {
  return useQuery({
    queryKey: keys.admin.menuPromos,
    queryFn: ({ signal }) => fetchAdminMenuPromos(signal),
    staleTime: 0,
  });
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.admin.menuPromos }),
      queryClient.invalidateQueries({ queryKey: keys.navigation }),
    ]);
}

function useSavePromo() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: AdminMenuPromoInput }) =>
      id ? updateAdminMenuPromo(id, input) : createAdminMenuPromo(input),
    onSuccess: refresh,
  });
}

function usePatchPromo() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<AdminMenuPromoInput> }) =>
      updateAdminMenuPromo(id, input),
    onSuccess: refresh,
  });
}

function useDeletePromo() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: deleteAdminMenuPromo, onSuccess: refresh });
}

// ----- the form, with a live preview of the tile -----

const empty = {
  pet: '',
  title: '',
  subtitle: '',
  imageUrl: '',
  imageAlt: '',
  link: '',
  active: true,
};

function PromoForm({ promo, onDone }: { promo: AdminMenuPromo | undefined; onDone: () => void }) {
  const toast = useToast();
  const save = useSavePromo();
  const [form, setForm] = useState(promo ? { ...promo, pet: promo.pet ?? '' } : empty);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof empty) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const parsed = AdminMenuPromoInputSchema.safeParse({
    pet: form.pet === '' ? null : form.pet,
    title: form.title,
    subtitle: form.subtitle,
    imageUrl: form.imageUrl,
    imageAlt: form.imageAlt,
    link: form.link,
    active: form.active,
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('. '));
      return;
    }
    save.mutate(
      { ...(promo && { id: promo.id }), input: parsed.data },
      {
        onSuccess: () => {
          toast.show(promo ? 'Promo saved' : 'Promo created', 'success');
          onDone();
        },
        onError: (err) => setError(adminErrorMessage(err)),
      },
    );
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      data-testid="admin-promo-form"
      className="flex flex-col gap-4"
    >
      <FormAlert message={error} />
      <Select
        label="Shown in"
        hint="Any pet is the fallback for a panel with no promo of its own."
        value={form.pet}
        onChange={set('pet')}
      >
        <option value="">Any pet</option>
        {PET_VALUES.map((p) => (
          <option key={p} value={p}>
            {speciesLabel(p)}
          </option>
        ))}
      </Select>
      <Input label="Title" value={form.title} onChange={set('title')} maxLength={60} />
      <Input label="Subtitle" value={form.subtitle} onChange={set('subtitle')} maxLength={120} />
      <Input
        label="Image"
        hint="A path such as /products/dog-toys/braided-tug-rope-1.webp or an https link."
        value={form.imageUrl}
        onChange={set('imageUrl')}
      />
      <Input
        label="Image description"
        hint="What the picture shows, for people who cannot see it."
        value={form.imageAlt}
        onChange={set('imageAlt')}
      />
      <Input
        label="Link"
        hint="A page of the shop, for example /collections/summer."
        value={form.link}
        onChange={set('link')}
      />
      <Checkbox
        label="Show this promo"
        checked={form.active}
        onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
      />
      <div>
        <p className="mb-1 font-display font-bold">Preview</p>
        {parsed.success ? (
          <div className="max-w-xs" data-testid="admin-promo-preview">
            <PromoTile promo={parsed.data} />
          </div>
        ) : (
          <p className="text-sm text-muted">Fill in the fields to see the tile.</p>
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending}>
          {promo ? 'Save promo' : 'Create promo'}
        </Button>
      </div>
    </form>
  );
}

// ----- the screen -----

export function NavigationAdmin() {
  const { data: promos, isPending, isError, refetch } = useMenuPromos();
  const patch = usePatchPromo();
  const remove = useDeletePromo();
  const toast = useToast();
  const [editing, setEditing] = useState<AdminMenuPromo | 'new' | null>(null);

  // Reordering gives each of two neighbours the other's list position (two small PATCHes, no
  // extra endpoint). It uses list positions, not the stored numbers, so gaps left by deleted
  // promos and equal numbers cannot make a swap do nothing.
  const move = (index: number, delta: -1 | 1) => {
    if (!promos) return;
    const other = promos[index + delta];
    const current = promos[index];
    if (!other || !current) return;
    const a = index;
    const b = index + delta;
    void Promise.all([
      patch.mutateAsync({ id: current.id, input: { sortOrder: b } }),
      patch.mutateAsync({ id: other.id, input: { sortOrder: a } }),
    ]).catch((err: unknown) => toast.show(adminErrorMessage(err), 'error'));
  };

  return (
    <section
      aria-labelledby="navigation-heading"
      data-testid="admin-navigation"
      className="flex flex-col gap-4"
    >
      <Seo title="Navigation" noindex />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="navigation-heading" className="font-display text-xl font-bold">
          Menu promos
        </h2>
        <Button onClick={() => setEditing('new')}>New promo</Button>
      </div>
      <p className="max-w-prose text-muted">
        The featured tile in each pet&apos;s menu panel. A panel shows its own pet&apos;s first
        active promo (lowest in the list), or the first &quot;Any pet&quot; promo when it has none.
      </p>
      {isError ? (
        <div role="alert" className="text-danger">
          We could not load the promos.{' '}
          <Button variant="secondary" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : isPending ? (
        <Skeleton className="h-40 w-full rounded-card" />
      ) : (
        <ul className="flex flex-col gap-3" data-testid="admin-promo-list">
          {promos.map((p, i) => (
            <li
              key={p.id}
              data-testid="admin-promo-row"
              className="flex flex-wrap items-center gap-3 rounded-card border border-line p-3"
            >
              <img
                src={p.imageUrl}
                alt=""
                width={64}
                height={40}
                className="h-10 w-16 shrink-0 rounded-control bg-pet-soft object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="break-words font-semibold">{p.title}</p>
                <p className="break-words text-sm text-muted">
                  {p.pet ? speciesLabel(p.pet) : 'Any pet'} &middot; {p.link}
                </p>
              </div>
              {!p.active && <Badge tone="neutral">Hidden</Badge>}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  Move up<span className="sr-only"> {p.title}</span>
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={i === promos.length - 1}
                  onClick={() => move(i, 1)}
                >
                  Move down<span className="sr-only"> {p.title}</span>
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setEditing(p)}>
                  Edit<span className="sr-only"> {p.title}</span>
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={remove.isPending && remove.variables === p.id}
                  onClick={() => {
                    if (!window.confirm(`Delete the promo "${p.title}"?`)) return;
                    remove.mutate(p.id, {
                      onSuccess: () => toast.show('Promo deleted', 'success'),
                      onError: (err) => toast.show(adminErrorMessage(err), 'error'),
                    });
                  }}
                >
                  Delete<span className="sr-only"> {p.title}</span>
                </Button>
              </div>
            </li>
          ))}
          {promos.length === 0 && <li className="text-muted">No promos yet.</li>}
        </ul>
      )}
      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' || editing === null ? 'New promo' : `Edit ${editing.title}`}
        className="max-h-[calc(100dvh-2rem)] max-w-xl overflow-y-auto"
      >
        {editing !== null && (
          <PromoForm
            key={editing === 'new' ? 'new' : editing.id}
            promo={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Dialog>
    </section>
  );
}
