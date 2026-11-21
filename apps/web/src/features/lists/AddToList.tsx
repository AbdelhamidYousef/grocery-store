import { useState } from 'react';

import { useToast } from '../../components/ui/Toast';
import { useT } from '../../i18n';
import { TEST_IDS } from '../../lib/test-ids';
import { useAuthOptional } from '../auth/AuthProvider';

import { useListActions, useLists } from './queries';

// On the product page, for a signed-in shopper: put this product (the chosen variant) on one of the
// shopper's lists. A choice in a select puts one unit on it; the quantity is edited on the list.
export function AddToList({
  productId,
  variantId,
  productName,
}: {
  productId: string;
  variantId: string | null;
  productName: string;
}) {
  const { user } = useAuthOptional();
  const { data: lists } = useLists();
  const actions = useListActions();
  const toast = useToast();
  const { t } = useT();
  const [value, setValue] = useState('');
  if (!user || !lists || lists.length === 0) return null;
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm" data-testid={TEST_IDS.addToList}>
      <span className="font-semibold">{t('lists.addTo')}</span>
      <select
        value={value}
        disabled={actions.put.isPending}
        onChange={(e) => {
          const id = e.target.value;
          const list = lists.find((l) => l.id === id);
          if (!list) return;
          setValue(id);
          actions.put.mutate(
            { id, productId, ...(variantId && { variantId }) },
            {
              onSuccess: () => toast.show(t('lists.added', { name: productName, list: list.name })),
              onError: () => toast.show(t('lists.error'), 'error'),
              onSettled: () => setValue(''),
            },
          );
        }}
        className="min-h-11 rounded-control border-2 border-line bg-surface px-3"
      >
        <option value="">{t('lists.choose')}</option>
        {lists.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </label>
  );
}
