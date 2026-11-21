import type { AdminOrderDetail, OrderStatus } from '@store/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Textarea } from '../../components/ui/Textarea';
import { useToast } from '../../components/ui/Toast';
import { TEST_IDS } from '../../lib/test-ids';
import { FormAlert } from '../auth/AuthCard';

import { adminErrorMessage } from './errors';
import { isDestructive, ORDER_STATUS_LABEL, TRANSITION_LABEL } from './order-status';
import { useTransitionAdminOrder } from './queries';

const NOTE_MAX = 300;

// What the confirm dialog tells the admin will happen. Written from the API's rules (see the
// transition service), so the warning matches the effect.
function consequence(detail: AdminOrderDetail, to: OrderStatus): string {
  const status = detail.order.status;
  if (to === 'cancelled' && status === 'pending_payment') {
    return 'The customer has not paid. The payment attempt is cancelled and the reserved stock is released.';
  }
  // An authorised payment holds money on the card without taking it: cancelling releases the hold.
  const held = detail.payment?.status === 'authorized';
  if (to === 'cancelled' && held) {
    return 'The hold on the customer card is released (nothing was charged) and the units go back on sale.';
  }
  if (to === 'cancelled') {
    return 'The payment is refunded in Stripe and the units go back on sale.';
  }
  if (held) {
    return 'The hold on the customer card is released (nothing was charged).';
  }
  return 'The payment is refunded in Stripe. Units that already shipped are not put back on sale automatically: once they are inspected, add them back from the product page with the reason Return.';
}

// Only the moves the API lists in `allowedNext` become buttons, so the server's 409 for a forbidden
// move is a safety net (two admins at once) and not something a person can click into. `paid` is
// filtered out as well: it happens only when Stripe confirms a payment, never by hand.
export function OrderTransitions({ detail }: { detail: AdminOrderDetail }) {
  const toast = useToast();
  const mutation = useTransitionAdminOrder(detail.order.number);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<OrderStatus | null>(null);
  const moves = detail.allowedNext.filter((to) => to !== 'paid');
  const tooLong = note.trim().length > NOTE_MAX;

  const run = (to: OrderStatus) => {
    setError(null);
    mutation.mutate(
      { to, ...(note.trim() && { note: note.trim() }) },
      {
        onSuccess: () => {
          setNote('');
          setConfirming(null);
          toast.show(`Order is now ${ORDER_STATUS_LABEL[to].toLowerCase()}`, 'success');
        },
        onError: (e) => {
          setConfirming(null);
          setError(adminErrorMessage(e));
        },
      },
    );
  };

  if (moves.length === 0) {
    return (
      <p className="text-muted" data-testid={TEST_IDS.adminTransition}>
        No further actions: this order is {ORDER_STATUS_LABEL[detail.order.status].toLowerCase()}.
      </p>
    );
  }

  // An order whose card is only authorised is shipped from the packer view, which charges the packed
  // amount and hands the bag to the rider; the status buttons would skip all that.
  const viaPacker =
    detail.order.authorizedCents !== null &&
    detail.order.capturedCents === null &&
    (detail.order.status === 'paid' || detail.order.status === 'processing');

  return (
    <div className="flex flex-col gap-3" data-testid={TEST_IDS.adminTransition}>
      {viaPacker && (
        <p data-testid="admin-via-packer">
          To ship this order, pack it and hand it to the rider in the{' '}
          <Link
            to={`/admin/picking?order=${encodeURIComponent(detail.order.number)}`}
            className="font-semibold text-primary-strong underline"
          >
            packer view
          </Link>
          : that charges the card for what was packed.
        </p>
      )}
      <FormAlert message={error} />
      <Textarea
        label="Note (optional)"
        hint="Saved in the order history with your name."
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        error={tooLong ? `At most ${NOTE_MAX} characters` : undefined}
      />
      <div className="flex flex-wrap gap-3">
        {moves.map((to) => (
          <Button
            key={to}
            variant={isDestructive(to) ? 'danger' : 'primary'}
            // While one move is in flight the others are off, so two clicks cannot race.
            disabled={tooLong || (mutation.isPending && mutation.variables?.to !== to)}
            loading={mutation.isPending && mutation.variables?.to === to}
            onClick={() => (isDestructive(to) ? setConfirming(to) : run(to))}
          >
            {TRANSITION_LABEL[to]}
          </Button>
        ))}
      </div>

      <Dialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title={confirming ? `${TRANSITION_LABEL[confirming]}?` : 'Confirm'}
      >
        {confirming && (
          <div className="flex flex-col gap-4">
            <p>{consequence(detail, confirming)}</p>
            <p className="font-semibold">This cannot be undone.</p>
            <div className="flex flex-wrap justify-end gap-3">
              <Button variant="secondary" onClick={() => setConfirming(null)}>
                Keep the order as it is
              </Button>
              <Button variant="danger" loading={mutation.isPending} onClick={() => run(confirming)}>
                Yes, {TRANSITION_LABEL[confirming].toLowerCase()}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
