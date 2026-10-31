import type { Address } from '@store/shared';
import { useState } from 'react';

import { Seo } from '../../components/Seo';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { countryName } from '../../lib/countries';
import { TEST_IDS } from '../../lib/test-ids';
import { formErrorMessage } from '../auth/form-errors';

import { AddressForm } from './AddressForm';
import { useAddresses, useDeleteAddress, useUpdateAddress } from './queries';

type Editing = { kind: 'new' } | { kind: 'edit'; address: Address } | null;

export function AddressesSection() {
  const { data: addresses, isPending, error, refetch } = useAddresses();
  const toast = useToast();
  const update = useUpdateAddress();
  const remove = useDeleteAddress();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<Address | null>(null);

  const makeDefault = (address: Address, kind: 'shipping' | 'billing') =>
    update.mutate(
      {
        id: address.id,
        input: kind === 'shipping' ? { isDefaultShipping: true } : { isDefaultBilling: true },
      },
      {
        onSuccess: () => toast.show(`Default ${kind} address updated`, 'success'),
        onError: (e) => toast.show(formErrorMessage(e), 'error'),
      },
    );

  return (
    <section aria-labelledby="addresses-heading" data-testid="account-addresses">
      <Seo title="Addresses" noindex />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="addresses-heading" className="font-display text-2xl font-bold">
          Addresses
        </h2>
        <Button onClick={() => setEditing({ kind: 'new' })} data-testid={TEST_IDS.addressAdd}>
          Add address
        </Button>
      </div>

      {isPending && <Skeleton className="mt-4 h-40 w-full rounded-card" />}
      {error && (
        <div className="mt-4" role="alert">
          <p className="font-semibold text-danger">We could not load your addresses.</p>
          <Button className="mt-2" variant="secondary" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      )}
      {addresses && addresses.length === 0 && (
        <p className="mt-4 text-muted" data-testid={TEST_IDS.emptyState}>
          You have no saved addresses yet. Add one and checkout will be quicker.
        </p>
      )}
      {addresses && addresses.length > 0 && (
        <ul className="mt-4 grid gap-4 lg:grid-cols-2" data-testid={TEST_IDS.addressList}>
          {addresses.map((a) => (
            <li
              key={a.id}
              data-testid={TEST_IDS.addressCard}
              className="flex min-w-0 flex-col gap-3 rounded-card border-2 border-line bg-surface p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                {a.label && (
                  <h3 className="min-w-0 break-words font-display font-bold">{a.label}</h3>
                )}
                {a.isDefaultShipping && <Badge tone="primary">Default shipping</Badge>}
                {a.isDefaultBilling && <Badge tone="success">Default billing</Badge>}
              </div>
              <address className="break-words not-italic">
                {a.fullName}
                <br />
                {a.line1}
                {a.line2 && (
                  <>
                    <br />
                    {a.line2}
                  </>
                )}
                <br />
                {a.postalCode} {a.city}
                {a.region ? `, ${a.region}` : ''}
                <br />
                {countryName(a.country)}
                {a.phone && (
                  <>
                    <br />
                    {a.phone}
                  </>
                )}
              </address>
              <div className="mt-auto flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setEditing({ kind: 'edit', address: a })}
                >
                  Edit<span className="sr-only"> address {a.label ?? a.line1}</span>
                </Button>
                {!a.isDefaultShipping && (
                  <Button size="sm" variant="ghost" onClick={() => makeDefault(a, 'shipping')}>
                    Make default shipping
                  </Button>
                )}
                {!a.isDefaultBilling && (
                  <Button size="sm" variant="ghost" onClick={() => makeDefault(a, 'billing')}>
                    Make default billing
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-danger"
                  onClick={() => setDeleting(a)}
                >
                  Delete<span className="sr-only"> address {a.label ?? a.line1}</span>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.kind === 'edit' ? 'Edit address' : 'Add address'}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
      >
        {editing && (
          <AddressForm
            // A new key per target so the form never shows the previous address's values.
            key={editing.kind === 'edit' ? editing.address.id : 'new'}
            {...(editing.kind === 'edit' ? { address: editing.address } : {})}
            onDone={() => {
              toast.show(editing.kind === 'edit' ? 'Address saved' : 'Address added', 'success');
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Dialog>

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this address?"
      >
        {deleting && (
          <>
            <p className="break-words">
              {deleting.fullName}, {deleting.line1}, {deleting.city} will be removed from your
              account.
            </p>
            <div className="flex flex-wrap justify-end gap-3">
              <Button variant="secondary" onClick={() => setDeleting(null)}>
                Keep it
              </Button>
              <Button
                variant="danger"
                loading={remove.isPending}
                data-testid="address-delete-confirm"
                onClick={() =>
                  remove.mutate(deleting.id, {
                    onSuccess: () => {
                      toast.show('Address deleted', 'success');
                      setDeleting(null);
                    },
                    onError: (e) => toast.show(formErrorMessage(e), 'error'),
                  })
                }
              >
                Delete
              </Button>
            </div>
          </>
        )}
      </Dialog>
    </section>
  );
}
