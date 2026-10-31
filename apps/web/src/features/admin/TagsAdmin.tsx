import { AdminTagInputSchema } from '@store/shared';
import { useState } from 'react';

import { Seo } from '../../components/Seo';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { FormAlert } from '../auth/AuthCard';

import { adminErrorMessage } from './errors';
import { useAdminTags, useCreateTag, useDeleteTag, useRenameTag } from './merch-queries';

// Health-need tags: create, rename (the slug is fixed), delete. Attaching them to products is on
// the product's own page.
export function TagsAdmin() {
  const { data: tags, isPending, isError, refetch } = useAdminTags();
  const create = useCreateTag();
  const rename = useRenameTag();
  const remove = useDeleteTag();
  const toast = useToast();
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = AdminTagInputSchema.safeParse({ slug, name });
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('. '));
      return;
    }
    create.mutate(parsed.data, {
      onSuccess: () => {
        setSlug('');
        setName('');
        toast.show('Tag created', 'success');
      },
      onError: (err) => setError(adminErrorMessage(err)),
    });
  };

  return (
    <section
      aria-labelledby="tags-heading"
      data-testid="admin-tags"
      className="flex flex-col gap-4"
    >
      <Seo title="Tags" noindex />
      <h2 id="tags-heading" className="font-display text-xl font-bold">
        Health-need tags
      </h2>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Slug" value={slug} onChange={(e) => setSlug(e.target.value)} />
        <Button type="submit" loading={create.isPending} className="sm:mt-6">
          Add tag
        </Button>
      </form>
      <FormAlert message={error} />
      {isError ? (
        <div role="alert" className="text-danger">
          We could not load the tags.{' '}
          <Button variant="secondary" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : isPending ? (
        <Skeleton className="h-32 w-full rounded-card" />
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-card border border-line">
          {tags.map((t) => (
            <li
              key={t.id}
              className="flex flex-wrap items-center gap-3 p-3"
              data-testid="admin-tag-row"
            >
              {editing?.id === t.id ? (
                <>
                  <Input
                    label={`New name for ${t.name}`}
                    value={editing.name}
                    onChange={(e) => setEditing({ id: t.id, name: e.target.value })}
                  />
                  <Button
                    loading={rename.isPending}
                    onClick={() =>
                      rename.mutate(
                        { id: t.id, name: editing.name },
                        {
                          onSuccess: () => setEditing(null),
                          onError: (err) => toast.show(adminErrorMessage(err), 'error'),
                        },
                      )
                    }
                  >
                    Save
                  </Button>
                  <Button variant="secondary" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 break-words font-semibold">{t.name}</span>
                  <span className="text-sm text-muted">
                    {t.slug} · {t.productCount} {t.productCount === 1 ? 'product' : 'products'}
                  </span>
                  <Button
                    variant="secondary"
                    onClick={() => setEditing({ id: t.id, name: t.name })}
                  >
                    Rename <span className="sr-only">{t.name}</span>
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (!window.confirm(`Delete ${t.name}? It is removed from its products.`))
                        return;
                      remove.mutate(t.id, {
                        onError: (err) => toast.show(adminErrorMessage(err), 'error'),
                      });
                    }}
                  >
                    Delete <span className="sr-only">{t.name}</span>
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
