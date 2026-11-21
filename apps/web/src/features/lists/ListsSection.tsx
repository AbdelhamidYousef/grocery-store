import type { ListDetail } from '@store/shared';
import { LISTS_MAX } from '@store/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { ApiError } from '../../api/client';
import { Seo } from '../../components/Seo';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { useT, type StringKey } from '../../i18n';
import { useFormat } from '../../i18n/format';
import { TEST_IDS } from '../../lib/test-ids';

import { useList, useListActions, useLists } from './queries';

const REASON: Record<'sold_out' | 'unavailable' | 'limit', StringKey> = {
  sold_out: 'account.reorder.reason.sold_out',
  unavailable: 'account.reorder.reason.unavailable',
  limit: 'account.reorder.reason.limit',
};

// A number box that keeps what is typed until the shopper leaves it (or presses Enter), then sends the
// quantity once: sending on every keystroke would turn "12" into a 1 and a 2 on the server.
function QuantityInput({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (quantity: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setText(String(value));
  }
  const commit = () => {
    const quantity = Math.min(99, Math.max(1, Math.floor(Number(text)) || 1));
    setText(String(quantity));
    if (quantity !== value) onCommit(quantity);
  };
  return (
    <input
      type="number"
      min={1}
      max={99}
      value={text}
      aria-label={label}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
      className="h-11 w-20 shrink-0 rounded-control border-2 border-line px-2 text-sm"
    />
  );
}

function ListItems({ list }: { list: ListDetail }) {
  const { t } = useT();
  const fmt = useFormat();
  const actions = useListActions();
  if (list.items.length === 0) return <p className="mt-3 text-muted">{t('lists.empty')}</p>;
  return (
    <ul className="mt-3 flex flex-col divide-y divide-line" data-testid={TEST_IDS.listItems}>
      {list.items.map((item) => (
        <li key={item.id} className="flex min-w-0 flex-wrap items-center gap-3 py-3">
          <Link
            to={`/products/${item.slug}`}
            className="min-w-0 flex-1 break-words font-semibold hover:underline"
          >
            {item.name}
            {item.variantName && (
              <span className="block text-sm text-muted">{item.variantName}</span>
            )}
          </Link>
          <span className="shrink-0 text-sm">
            {item.priceCents === null ? '' : fmt.money(item.priceCents, item.currency)}
            {!item.available && (
              <span className="ml-2 font-semibold text-danger">{t('account.reorder.soldOut')}</span>
            )}
          </span>
          <QuantityInput
            label={t('lists.quantityOf', { name: item.name })}
            value={item.quantity}
            onCommit={(quantity) =>
              actions.setQuantity.mutate({ id: list.id, itemId: item.id, quantity })
            }
          />
          <Button
            variant="ghost"
            size="sm"
            aria-label={t('lists.remove', { name: item.name })}
            onClick={() => actions.removeItem.mutate({ id: list.id, itemId: item.id })}
          >
            {t('lists.removeShort')}
          </Button>
        </li>
      ))}
    </ul>
  );
}

// Account > Lists: "Saved" (the old wishlist) and the named lists, each with quantities and one
// button that puts everything in stock at the shopper's store in the basket and lists the rest.
export function ListsSection() {
  const { t, tn } = useT();
  const { data: lists, isPending, error } = useLists();
  const actions = useListActions();
  const [picked, setPicked] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const selectedId = picked ?? lists?.find((l) => l.isDefault)?.id ?? lists?.[0]?.id ?? null;
  const selected = lists?.find((l) => l.id === selectedId);
  const { data: detail } = useList(selectedId);
  const result = actions.addToCart.data;

  const say = (e: unknown) =>
    setProblem(e instanceof ApiError && e.status < 500 ? e.message : t('lists.error'));

  return (
    <section aria-labelledby="lists-heading" data-testid={TEST_IDS.pageLists}>
      <Seo title={t('lists.heading')} noindex />
      <h2 id="lists-heading" className="font-display text-2xl font-bold">
        {t('lists.heading')}
      </h2>
      <p className="mt-1 text-muted">{t('lists.intro')}</p>
      {isPending && <Skeleton className="mt-4 h-24 w-full rounded-card" />}
      {error && <p className="mt-4 text-danger">{t('lists.loadError')}</p>}
      {problem && (
        <p role="alert" className="mt-3 font-semibold text-danger">
          {problem}
        </p>
      )}
      {lists && (
        <>
          <ul className="mt-4 flex flex-wrap gap-2" aria-label={t('lists.heading')}>
            {lists.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  aria-pressed={l.id === selectedId}
                  onClick={() => {
                    setPicked(l.id);
                    setRenaming(null);
                    setProblem(null);
                    actions.addToCart.reset();
                  }}
                  className="min-h-11 rounded-full border-2 border-line px-4 font-semibold aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:text-primary-strong"
                >
                  {l.name} ({l.itemCount})
                </button>
              </li>
            ))}
          </ul>

          {lists.length < LISTS_MAX && (
            <form
              className="mt-4 flex max-w-md flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newName.trim()) return;
                setProblem(null);
                actions.create.mutate(newName, {
                  onSuccess: (made) => {
                    setNewName('');
                    setPicked(made.id);
                  },
                  onError: say,
                });
              }}
            >
              <div className="min-w-0 flex-1">
                <Input
                  label={t('lists.newLabel')}
                  value={newName}
                  maxLength={40}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <Button type="submit" variant="secondary" loading={actions.create.isPending}>
                {t('lists.create')}
              </Button>
            </form>
          )}

          {selected && detail && (
            <div className="mt-6" data-testid={TEST_IDS.listDetail}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="break-words font-display text-xl font-bold">{selected.name}</h3>
                {!selected.isDefault && (
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setRenaming(selected.id)}>
                      {t('lists.rename')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        actions.remove.mutate(selected.id, {
                          onSuccess: () => setPicked(null),
                          onError: say,
                        })
                      }
                    >
                      {t('lists.delete')}
                    </Button>
                  </div>
                )}
              </div>
              {renaming === selected.id && (
                <RenameForm
                  initial={selected.name}
                  onCancel={() => setRenaming(null)}
                  onSave={(name) =>
                    actions.rename.mutate(
                      { id: selected.id, name },
                      { onSuccess: () => setRenaming(null), onError: say },
                    )
                  }
                />
              )}
              <ListItems list={detail} />
              {detail.items.length > 0 && (
                <div className="mt-4">
                  <Button
                    loading={actions.addToCart.isPending}
                    onClick={() => actions.addToCart.mutate(selected.id, { onError: say })}
                  >
                    {t('lists.addAll')}
                  </Button>
                </div>
              )}
              {result && (
                <div role="status" className="mt-3 text-sm" data-testid={TEST_IDS.listToCart}>
                  <p className="font-semibold">
                    {result.added.length > 0
                      ? tn('account.reorder.added', result.added.length)
                      : t('account.reorder.nothing')}{' '}
                    <Link to="/cart" className="text-primary-strong underline">
                      {t('account.reorder.viewCart')}
                    </Link>
                  </p>
                  {result.skipped.length > 0 && (
                    <ul className="mt-1 list-disc pl-5 text-muted">
                      {result.skipped.map((s) => (
                        <li key={`${s.name}-${s.variantName}`}>
                          {t('account.reorder.skipped', {
                            name: s.name,
                            variant: s.variantName,
                            reason: t(REASON[s.reason]),
                          })}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function RenameForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  const [name, setName] = useState(initial);
  return (
    <form
      className="mt-3 flex max-w-md flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSave(name);
      }}
    >
      <div className="min-w-0 flex-1">
        <Input
          label={t('lists.renameLabel')}
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <Button type="submit" variant="secondary">
        {t('lists.save')}
      </Button>
      <Button variant="ghost" onClick={onCancel}>
        {t('lists.cancel')}
      </Button>
    </form>
  );
}
