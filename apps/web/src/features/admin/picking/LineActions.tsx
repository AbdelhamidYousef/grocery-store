import { formatGrams, formatMoney, type PickLine } from '@store/shared';
import { useState, type FormEvent } from 'react';

import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useToast } from '../../../components/ui/Toast';
import { adminErrorMessage } from '../errors';

import { useMarkLine } from './queries';
import { ShortfallDialog } from './ShortfallDialog';

// What the packer can do with one line, the same everywhere the line appears (the walk and the bag).
// `locked` is a closed bag: nothing changes any more.
export function LineActions({ line, locked }: { line: PickLine; locked: boolean }) {
  const toast = useToast();
  const mark = useMarkLine();
  const [grams, setGrams] = useState(line.packedGrams === null ? '' : String(line.packedGrams));
  const [dialog, setDialog] = useState(false);
  const run = (input: Parameters<typeof mark.mutate>[0]['input']) =>
    mark.mutate(
      { number: line.orderNumber, itemId: line.itemId, input },
      { onError: (e) => toast.show(adminErrorMessage(e), 'error') },
    );

  if (line.swapStatus === 'rejected') {
    return <p className="text-sm text-muted">The shopper refused this replacement.</p>;
  }
  const settled = line.pickStatus === 'short' || line.pickStatus === 'substituted';
  const missing = line.pickStatus === 'missing';
  const needsGrams = line.weighed && !missing;
  const gramsNumber = Number(grams);
  const gramsValid = Number.isInteger(gramsNumber) && gramsNumber > 0;

  const weigh = (event: FormEvent) => {
    event.preventDefault();
    if (gramsValid) run({ action: 'weigh', grams: gramsNumber });
  };

  return (
    <div className="flex flex-col gap-2">
      {(settled || missing) && (
        <p className="text-sm font-semibold text-danger">
          {missing ? 'None found.' : `Found ${line.pickedQty ?? 0} of ${line.quantity}.`}
          {line.pickStatus === 'substituted' && ' A replacement is with the shopper.'}
        </p>
      )}
      {needsGrams && (
        <form onSubmit={weigh} className="flex flex-wrap items-end gap-2">
          <Input
            label="Grams on the scale"
            inputMode="numeric"
            className="w-36"
            value={grams}
            disabled={locked}
            onChange={(e) => setGrams(e.target.value)}
            hint={
              line.packedGrams !== null && line.pricePerKgCents !== null
                ? `${formatGrams(line.packedGrams, 'en-IE')} weighed`
                : line.pricePerKgCents !== null
                  ? `${formatMoney(line.pricePerKgCents, 'EUR')} per kg`
                  : undefined
            }
          />
          <Button
            type="submit"
            size="sm"
            variant={line.packedGrams === null ? 'primary' : 'secondary'}
            disabled={locked || !gramsValid}
            loading={mark.isPending}
          >
            {line.packedGrams === null ? 'Weigh' : 'Update'}
          </Button>
        </form>
      )}
      {!locked && line.pickStatus === 'pending' && !line.weighed && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" loading={mark.isPending} onClick={() => run({ action: 'found' })}>
            Found all {line.quantity}
          </Button>
          {line.quantity > 0 && line.replaces === null && (
            <Button size="sm" variant="secondary" onClick={() => setDialog(true)}>
              Not all found
            </Button>
          )}
        </div>
      )}
      {!locked && line.weighed && line.pickStatus === 'pending' && line.replaces === null && (
        <Button size="sm" variant="ghost" onClick={() => setDialog(true)}>
          Not all found
        </Button>
      )}
      {!locked && line.resolved && line.pickStatus === 'picked' && line.replaces === null && (
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-primary-strong">Picked</span>
          <Button size="sm" variant="ghost" onClick={() => run({ action: 'reset' })}>
            Undo
          </Button>
        </div>
      )}
      {locked && line.resolved && line.pickStatus === 'picked' && (
        <span className="text-sm font-semibold text-primary-strong">Picked</span>
      )}
      {dialog && <ShortfallDialog line={line} onClose={() => setDialog(false)} />}
    </div>
  );
}
