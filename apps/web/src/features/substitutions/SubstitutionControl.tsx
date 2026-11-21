import { useId, useState } from 'react';

import type { WebCartItem } from '../../api/cart';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Spinner } from '../../components/ui/Spinner';
import { useT } from '../../i18n';
import { useFormat } from '../../i18n/format';
import { image600 } from '../../lib/images';
import { TEST_IDS } from '../../lib/test-ids';

import { useSubstitutes, useSubstitutionActions } from './queries';

// "If it's missing" on one cart line: a best match, a product the shopper picks from that line's own
// best-match list (top 5, so always safe), or no replacement (we refund it). The choice is saved
// at once and copied to the order at checkout.
export function SubstitutionControl({ item, currency }: { item: WebCartItem; currency: string }) {
  const { t } = useT();
  const id = useId();
  const actions = useSubstitutionActions();
  const [picking, setPicking] = useState(false);
  const specific = item.substitution === 'specific' && item.substitute !== null;

  return (
    <div className="flex flex-col gap-1 text-sm" data-testid={TEST_IDS.substitutionControl}>
      <label htmlFor={id} className="font-semibold">
        {t('subs.label')}
      </label>
      <select
        id={id}
        value={item.substitution}
        disabled={actions.pending}
        onChange={(event) => {
          const value = event.target.value;
          if (value === 'specific') setPicking(true);
          else if (value === 'best_match' || value === 'none') {
            actions.setLine(item.id, { substitution: value });
          }
        }}
        className="min-h-11 w-full max-w-xs rounded-control border border-line bg-surface px-3"
      >
        <option value="best_match">{t('subs.option.best_match')}</option>
        <option value="specific">{t('subs.option.specific')}</option>
        <option value="none">{t('subs.option.none')}</option>
      </select>
      {item.substitution === 'best_match' && (
        <p className="text-muted">{t('subs.hint.best_match')}</p>
      )}
      {item.substitution === 'none' && <p className="text-muted">{t('subs.hint.none')}</p>}
      {specific && item.substitute && (
        <p className="text-muted" data-testid={TEST_IDS.substitutionChosen}>
          {t('subs.chosen', { name: item.substitute.productName })}{' '}
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="min-h-11 font-semibold underline"
          >
            {t('subs.change')}
          </button>
        </p>
      )}
      <PickDialog
        open={picking}
        item={item}
        currency={currency}
        onClose={() => setPicking(false)}
        onPick={(variantId) => {
          actions.setLine(item.id, { substitution: 'specific', substituteVariantId: variantId });
          setPicking(false);
        }}
      />
    </div>
  );
}

function PickDialog({
  open,
  item,
  currency,
  onClose,
  onPick,
}: {
  open: boolean;
  item: WebCartItem;
  currency: string;
  onClose: () => void;
  onPick: (variantId: string) => void;
}) {
  const { t } = useT();
  const fmt = useFormat();
  const options = useSubstitutes(item.productSlug, item.variantId, open);
  return (
    <Dialog open={open} onClose={onClose} title={t('subs.pick.title', { name: item.productName })}>
      <p className="text-sm text-muted">{t('subs.pick.intro')}</p>
      {options.isPending && <Spinner />}
      {options.isError && <p role="alert">{t('subs.pick.error')}</p>}
      {options.data?.length === 0 && (
        <p data-testid={TEST_IDS.substitutionNone}>{t('subs.pick.empty')}</p>
      )}
      <ul className="flex flex-col gap-2">
        {options.data?.map((o) => (
          <li key={o.variantId} className="flex items-center gap-3">
            {o.imageUrl ? (
              <img
                src={image600(o.imageUrl)}
                alt=""
                width={48}
                height={48}
                className="h-12 w-12 shrink-0 rounded-control bg-dept-soft object-cover"
              />
            ) : (
              <span className="h-12 w-12 shrink-0 rounded-control bg-dept-soft" />
            )}
            <span className="min-w-0 flex-1 text-sm">
              <span className="block break-words font-semibold">{o.productName}</span>
              <span className="block break-words text-muted">
                {o.variantName} · {fmt.money(o.unitPriceCents, currency)}
              </span>
            </span>
            <Button
              type="button"
              variant="secondary"
              data-testid={TEST_IDS.substitutionPick}
              onClick={() => onPick(o.variantId)}
            >
              {t('subs.pick.choose')}
              <span className="sr-only">{o.productName}</span>
            </Button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
