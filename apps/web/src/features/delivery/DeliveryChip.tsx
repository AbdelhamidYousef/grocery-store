import { useState } from 'react';

import { Dialog } from '../../components/ui/Dialog';
import { useT } from '../../i18n';
import { cn } from '../../lib/cn';

import { useDelivery } from './DeliveryContext';
import { DeliveryResult } from './DeliveryResult';
import { PostcodeForm } from './PostcodeForm';

function PinIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

// The header's delivery chip: "Deliver to 10115" or "Enter postcode". It opens a small dialog with
// the same form as the home hero, so the postcode can be set or changed from any page.
export function DeliveryChip() {
  const { t } = useT();
  const { postcode, served, status, clear, setPostcode } = useDelivery();
  const [open, setOpen] = useState(false);
  const unserved = postcode !== null && status === 'ready' && !served;

  const long = !postcode
    ? t('delivery.chip.enter')
    : unserved
      ? t('delivery.chip.notServed', { postcode })
      : t('delivery.chip.deliverTo', { postcode });
  // The row is tight on a phone: only the number (or "Postcode") fits next to the search box.
  const short = postcode ?? t('delivery.chip.shortEnter');

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={t('delivery.chip.label', { state: long })}
        data-testid="delivery-chip"
        onClick={() => setOpen(true)}
        className={cn(
          'flex min-h-11 shrink-0 items-center gap-1.5 rounded-control border-2 px-3 text-sm font-semibold hover:bg-dept-soft',
          unserved ? 'border-danger text-danger' : 'border-line text-ink',
        )}
      >
        <PinIcon />
        <span className="sm:hidden">{short}</span>
        <span className="hidden sm:inline">{long}</span>
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t('delivery.dialog.title')}>
        <p className="mb-4 text-muted">{t('delivery.dialog.lead')}</p>
        <PostcodeForm
          testId="delivery-dialog-form"
          initial={postcode ?? ''}
          className="flex flex-col gap-3 sm:flex-row sm:items-start"
          hint=""
          onSubmit={(code) => {
            setPostcode(code);
          }}
        />
        <DeliveryResult testId="delivery-dialog-result" />
        {postcode && (
          <button
            type="button"
            onClick={() => {
              clear();
            }}
            className="mt-3 text-sm font-semibold text-primary-strong underline"
          >
            {t('delivery.form.clear')}
          </button>
        )}
      </Dialog>
    </>
  );
}
