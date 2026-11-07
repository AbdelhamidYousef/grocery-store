import { MAX_BOUGHT_TOGETHER, MAX_RELATED, type RelationKind } from '@store/shared';
import { useState } from 'react';

import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useAdminProducts } from '../queries';

import type { ContentForm } from './content-form';
import { EditorSection, moveItem, RowControls } from './EditorList';

const KINDS: { kind: RelationKind; title: string; hint: string; max: number }[] = [
  {
    kind: 'bought_together',
    title: 'Frequently bought together',
    hint: 'Up to 3. Shown with checkboxes and one "Add all" button. When empty, the shop uses what customers bought with it, then the same category.',
    max: MAX_BOUGHT_TOGETHER,
  },
  {
    kind: 'related',
    title: 'You may also like',
    hint: 'Up to 8. When empty, the shop shows the same category.',
    max: MAX_RELATED,
  },
];

interface Props {
  productId: string;
  form: ContentForm;
  onChange: (next: ContentForm) => void;
}

// Editor picks for one product. The picker searches the admin product list by name; a list holds
// each product once, never the product itself, and stops offering "Add" at its maximum.
export function RelationsEditor({ productId, form, onChange }: Props) {
  return (
    <div className="flex flex-col gap-8">
      {KINDS.map((k) => (
        <RelationList key={k.kind} productId={productId} form={form} onChange={onChange} {...k} />
      ))}
    </div>
  );
}

function RelationList({
  productId,
  form,
  onChange,
  kind,
  title,
  hint,
  max,
}: Props & { kind: RelationKind; title: string; hint: string; max: number }) {
  const [term, setTerm] = useState('');
  const query = term.trim();
  const inList = form.relations.filter((r) => r.kind === kind);
  const taken = new Set(inList.map((r) => r.relatedId));

  // Lists of the other kind keep their place; this one is rewritten in order.
  const setList = (list: ContentForm['relations']) =>
    onChange({ ...form, relations: [...form.relations.filter((r) => r.kind !== kind), ...list] });

  return (
    <EditorSection title={title} hint={hint}>
      <ul className="flex flex-col gap-3">
        {inList.map((r, i) => (
          <li key={r.relatedId} className="flex flex-col gap-2 rounded-card border border-line p-3">
            <span className="min-w-0 break-words font-semibold">{r.relatedName}</span>
            <RowControls
              noun={`${kind === 'related' ? 'related' : 'bundle'} product`}
              index={i}
              count={inList.length}
              onMove={(from, to) => setList(moveItem(inList, from, to))}
              onRemove={(at) => setList(inList.filter((_, j) => j !== at))}
            />
          </li>
        ))}
        {inList.length === 0 && <li className="text-sm text-muted">Nothing picked: automatic.</li>}
      </ul>
      {inList.length < max ? (
        <div className="flex flex-col gap-2">
          <Input
            label={`Find a product for ${title}`}
            hint="Type at least 2 letters of its name."
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
          {query.length >= 2 && (
            <SearchResults
              term={query}
              exclude={new Set([productId, ...taken])}
              noun={title}
              onPick={(p) => {
                setList([...inList, { relatedId: p.id, relatedName: p.name, kind }]);
                setTerm('');
              }}
            />
          )}
        </div>
      ) : (
        <p className="text-sm text-muted">This list is full.</p>
      )}
    </EditorSection>
  );
}

// Only mounted while there is a search term, so no request goes out for an empty box.
function SearchResults({
  term,
  exclude,
  noun,
  onPick,
}: {
  term: string;
  exclude: ReadonlySet<string>;
  noun: string;
  onPick: (product: { id: string; name: string }) => void;
}) {
  const { data } = useAdminProducts({ q: term, limit: 6 });
  const results = (data?.data ?? []).filter((p) => !exclude.has(p.id));
  return (
    <ul className="flex flex-col gap-1">
      {results.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
          <span className="min-w-0 break-words">{p.name}</span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-label={`Add ${p.name} to ${noun}`}
            onClick={() => onPick(p)}
          >
            Add
          </Button>
        </li>
      ))}
    </ul>
  );
}
