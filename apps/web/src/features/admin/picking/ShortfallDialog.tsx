import { formatMoney, type PickLine } from '@store/shared';
import { useState } from 'react';

import { Button } from '../../../components/ui/Button';
import { Dialog } from '../../../components/ui/Dialog';
import { Input } from '../../../components/ui/Input';
import { useToast } from '../../../components/ui/Toast';
import { adminErrorMessage } from '../errors';

import { useLineSubstitutes, useRecordShortfall } from './queries';

const PREFERENCE_TEXT = {
  best_match: 'The shopper accepts the closest match.',
  specific: 'The shopper chose one product as the replacement.',
  none: 'The shopper asked for no replacement: the missing units are not charged.',
} as const;

// The packer found fewer than ordered: how many, and which replacement to offer. The safe list is
// the one the shopper sees; "closest match" lets the server choose.
export function ShortfallDialog({ line, onClose }: { line: PickLine; onClose: () => void }) {
  const toast = useToast();
  const record = useRecordShortfall();
  const none = line.substitution === 'none';
  const specific = line.substitution === 'specific';
  const options = useLineSubstitutes(line.orderNumber, line.itemId, !none && !specific);
  const [found, setFound] = useState('0');
  const [choice, setChoice] = useState('auto');
  const foundNumber = Number(found);
  const valid = Number.isInteger(foundNumber) && foundNumber >= 0 && foundNumber < line.quantity;

  const save = () => {
    record.mutate(
      {
        number: line.orderNumber,
        itemId: line.itemId,
        input: {
          pickedQty: foundNumber,
          ...(choice !== 'auto' && !none && !specific && { substituteVariantId: choice }),
        },
      },
      {
        onSuccess: () => {
          toast.show('Shortfall recorded', 'success');
          onClose();
        },
        onError: (e) => toast.show(adminErrorMessage(e), 'error'),
      },
    );
  };

  return (
    <Dialog open onClose={onClose} title={`${line.productName}: not all found`}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          {line.quantity} ordered for bag {line.bag}. {PREFERENCE_TEXT[line.substitution]}
        </p>
        <Input
          label="Units found"
          inputMode="numeric"
          value={found}
          onChange={(e) => setFound(e.target.value)}
          hint={`From 0 to ${line.quantity - 1}`}
          error={valid ? undefined : `Enter a whole number from 0 to ${line.quantity - 1}`}
        />
        {!none && !specific && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-semibold">Replacement to offer</legend>
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name="swap"
                checked={choice === 'auto'}
                onChange={() => setChoice('auto')}
              />
              Closest match
            </label>
            {options.data?.map((o) => (
              <label key={o.variantId} className="flex min-h-11 items-center gap-2">
                <input
                  type="radio"
                  name="swap"
                  checked={choice === o.variantId}
                  onChange={() => setChoice(o.variantId)}
                />
                <span className="min-w-0 break-words">
                  {o.productName} ({o.variantName}), {formatMoney(o.unitPriceCents, 'EUR')}
                </span>
              </label>
            ))}
            {options.isSuccess && options.data.length === 0 && (
              <p className="text-sm text-muted">No safe replacement is in stock at this store.</p>
            )}
          </fieldset>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!valid} loading={record.isPending} onClick={save}>
            Record shortfall
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
