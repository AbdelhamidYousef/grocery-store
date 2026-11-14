import type { Address } from '@store/shared';
import { useState } from 'react';

import { Seo } from '../../components/Seo';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { useT } from '../../i18n';
import { useFormat } from '../../i18n/format';
import { countryName } from '../../lib/countries';
import { TEST_IDS } from '../../lib/test-ids';
import { formErrorMessage } from '../auth/form-errors';

import { AddressForm } from './AddressForm';
import { useAddresses, useDeleteAddress, useUpdateAddress } from './queries';

type Editing = { kind: 'new' } | { kind: 'edit'; address: Address } | null;

export function AddressesSection() {
  const { data: addresses, isPending, error, refetch } = useAddresses();
  const toast = useToast();
  const { t, tm } = useT();
  const fmt = useFormat();
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
        onSuccess: () =>
          toast.show(
            kind === 'shipping'
              ? t('account.addresses.shippingUpdated')
              : t('account.addresses.billingUpdated'),
            'success',
          ),
        onError: (e) => toast.show(formErrorMessage(e, t, tm), 'error'),
      },
    );

  return (
    <section aria-labelledby="addresses-heading" data-testid="account-addresses">
      <Seo title={t('account.addresses.heading')} noindex />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="addresses-heading" className="font-display text-2xl font-bold">
          {t('account.addresses.heading')}
        </h2>
        <Button onClick={() => setEditing({ kind: 'new' })} data-testid={TEST_IDS.addressAdd}>
          {t('account.addresses.add')}
        </Button>
      </div>

      {isPending && <Skeleton className="mt-4 h-40 w-full rounded-card" />}
      {error && (
        <div className="mt-4" role="alert">
          <p className="font-semibold text-danger">{t('account.addresses.loadError')}</p>
          <Button className="mt-2" variant="secondary" onClick={() => void refetch()}>
            {t('account.addresses.tryAgain')}
          </Button>
        </div>
      )}
      {addresses && addresses.length === 0 && (
        <p className="mt-4 text-muted" data-testid={TEST_IDS.emptyState}>
          {t('account.addresses.empty')}
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
                {a.isDefaultShipping && (
                  <Badge tone="primary">{t('account.addresses.defaultShipping')}</Badge>
                )}
                {a.isDefaultBilling && (
                  <Badge tone="success">{t('account.addresses.defaultBilling')}</Badge>
                )}
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
                {t('account.addresses.postalCity', { postalCode: a.postalCode, city: a.city })}
                {a.region ? `, ${a.region}` : ''}
                <br />
                {countryName(a.country, fmt.locale)}
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
                  {t('account.addresses.edit')}
                  <span className="sr-only">
                    {' '}
                    {t('account.addresses.forAddress', { name: a.label ?? a.line1 })}
                  </span>
                </Button>
                {!a.isDefaultShipping && (
                  <Button size="sm" variant="ghost" onClick={() => makeDefault(a, 'shipping')}>
                    {t('account.addresses.makeShipping')}
                  </Button>
                )}
                {!a.isDefaultBilling && (
                  <Button size="sm" variant="ghost" onClick={() => makeDefault(a, 'billing')}>
                    {t('account.addresses.makeBilling')}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-danger"
                  onClick={() => setDeleting(a)}
                >
                  {t('account.addresses.delete')}
                  <span className="sr-only">
                    {' '}
                    {t('account.addresses.forAddress', { name: a.label ?? a.line1 })}
                  </span>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={
          editing?.kind === 'edit' ? t('account.addresses.editTitle') : t('account.addresses.add')
        }
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
      >
        {editing && (
          <AddressForm
            // A new key per target so the form never shows the previous address's values.
            key={editing.kind === 'edit' ? editing.address.id : 'new'}
            {...(editing.kind === 'edit' ? { address: editing.address } : {})}
            onDone={() => {
              toast.show(
                editing.kind === 'edit'
                  ? t('account.addresses.saved')
                  : t('account.addresses.added'),
                'success',
              );
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Dialog>

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t('account.addresses.deleteTitle')}
      >
        {deleting && (
          <>
            <p className="break-words">
              {t('account.addresses.deleteBody', {
                name: deleting.fullName,
                line1: deleting.line1,
                city: deleting.city,
              })}
            </p>
            <div className="flex flex-wrap justify-end gap-3">
              <Button variant="secondary" onClick={() => setDeleting(null)}>
                {t('account.addresses.keep')}
              </Button>
              <Button
                variant="danger"
                loading={remove.isPending}
                data-testid="address-delete-confirm"
                onClick={() =>
                  remove.mutate(deleting.id, {
                    onSuccess: () => {
                      toast.show(t('account.addresses.deleted'), 'success');
                      setDeleting(null);
                    },
                    onError: (e) => toast.show(formErrorMessage(e, t, tm), 'error'),
                  })
                }
              >
                {t('account.addresses.delete')}
              </Button>
            </div>
          </>
        )}
      </Dialog>
    </section>
  );
}
