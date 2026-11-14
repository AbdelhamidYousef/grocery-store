import { formatMoney } from '@store/shared';
import { useState } from 'react';

import { Button } from '../../components/ui/Button';
import { TEST_IDS } from '../../lib/test-ids';

import { useReferral } from './queries';

// "Refer a friend": the link, how it works, and how many friends are where. The amounts and the
// limits come from the server, so the copy can never promise a number the rules do not give.
export function ReferralPanel() {
  const { data } = useReferral();
  const [copied, setCopied] = useState(false);
  if (!data) return null;
  const link = `${window.location.origin}/?ref=${data.code}`;
  const money = (c: number) => formatMoney(c, 'EUR');
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
        Refer a friend
      </h3>
      <p className="mt-1 max-w-prose">
        Share your link. When a friend makes an account and pays for their first order of{' '}
        {money(data.minOrderCents)} or more, you both get a {money(data.rewardCents)} code (valid{' '}
        {data.codeDays} days, for an order of {money(data.minOrderCents)} or more).
      </p>
      <p
        className="mt-3 break-all rounded-control bg-pet-soft px-3 py-2 font-mono text-sm"
        data-testid={TEST_IDS.referralLink}
      >
        {link}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy link'}
        </Button>
        <span role="status" className="sr-only">
          {copied ? 'Link copied' : ''}
        </span>
        <p className="text-sm text-muted">
          {data.qualified} rewarded, {data.pending} waiting for a first order
          {data.rejected > 0 ? `, ${data.rejected} not eligible` : ''}. Up to {data.maxPerYear} a
          year.
        </p>
      </div>
    </section>
  );
}
