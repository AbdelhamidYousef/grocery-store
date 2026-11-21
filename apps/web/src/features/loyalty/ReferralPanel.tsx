import { useState } from 'react';

import { Button } from '../../components/ui/Button';
import { useT } from '../../i18n';
import { useFormat } from '../../i18n/format';
import { TEST_IDS } from '../../lib/test-ids';
import { useStorePath } from '../stores/StoreContext';

import { useReferral } from './queries';

// "Refer a friend": the link, how it works, and how many friends are where. The amounts and the
// limits come from the server, so the copy can never promise a number the rules do not give.
export function ReferralPanel() {
  const { data } = useReferral();
  const { t } = useT();
  const fmt = useFormat();
  const storePath = useStorePath();
  const [copied, setCopied] = useState(false);
  if (!data) return null;
  const link = `${window.location.origin}${storePath('/')}?ref=${data.code}`;
  const money = (c: number) => fmt.money(c);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // No clipboard permission: the link is selectable text right above the button.
      setCopied(false);
    }
  };
  return (
    <section
      aria-labelledby="referral-heading"
      data-testid={TEST_IDS.referralPanel}
      className="mt-8 rounded-card border-2 border-line p-4"
    >
      <h3 id="referral-heading" className="font-display text-xl font-bold">
        {t('loyalty.referral.title')}
      </h3>
      <p className="mt-1 max-w-prose">
        {t('loyalty.referral.how', {
          min: money(data.minOrderCents),
          reward: money(data.rewardCents),
          days: data.codeDays,
        })}
      </p>
      <p
        className="mt-3 break-all rounded-control bg-dept-soft px-3 py-2 font-mono text-sm"
        data-testid={TEST_IDS.referralLink}
      >
        {link}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => void copy()}>
          {copied ? t('loyalty.referral.copied') : t('loyalty.referral.copy')}
        </Button>
        <span role="status" className="sr-only">
          {copied ? t('loyalty.referral.linkCopied') : ''}
        </span>
        <p className="text-sm text-muted">
          {t(data.rejected > 0 ? 'loyalty.referral.statsRejected' : 'loyalty.referral.stats', {
            qualified: data.qualified,
            pending: data.pending,
            rejected: data.rejected,
            max: data.maxPerYear,
          })}
        </p>
      </div>
    </section>
  );
}
