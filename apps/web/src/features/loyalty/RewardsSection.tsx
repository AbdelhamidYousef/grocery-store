import { type PersonalCode, type PointKind, type Reward } from '@store/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { ApiError } from '../../api/client';
import { Seo } from '../../components/Seo';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { useT, type StringKey, type TFunction } from '../../i18n';
import { useFormat } from '../../i18n/format';
import { TEST_IDS } from '../../lib/test-ids';

import {
  useCharityTotal,
  useDonatePoints,
  useMyCodes,
  usePoints,
  useRedeemReward,
  useRewards,
} from './queries';
import { ReferralPanel } from './ReferralPanel';

const KIND_LABEL: Record<PointKind, StringKey> = {
  earn: 'loyalty.rewards.kind.earn',
  redeem: 'loyalty.rewards.kind.redeem',
  reversal: 'loyalty.rewards.kind.reversal',
  bonus: 'loyalty.rewards.kind.bonus',
  donate: 'loyalty.rewards.kind.donate',
  adjust: 'loyalty.rewards.kind.adjust',
};

const codeValue = (c: PersonalCode, t: TFunction, fmt: ReturnType<typeof useFormat>) =>
  c.kind === 'free_shipping'
    ? t('loyalty.rewards.code.freeDelivery')
    : c.kind === 'fixed'
      ? t('loyalty.rewards.code.fixedOff', { amount: fmt.money(c.value) })
      : t('loyalty.rewards.code.percentOff', { percent: c.value });

// Give points to the (pretend) shelter: 1 point = 1 cent.
function DonateBox({ balance }: { balance: number }) {
  const donate = useDonatePoints();
  const toast = useToast();
  const { t, tm } = useT();
  const total = useCharityTotal().data;
  const [text, setText] = useState('');
  const points = Number.parseInt(text, 10);
  const valid = Number.isInteger(points) && points >= 1 && points <= balance;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    donate.mutate(points, {
      onSuccess: () => {
        toast.show(t('loyalty.rewards.donate.thanks', { points }), 'success');
        setText('');
      },
      onError: (err) =>
        toast.show(
          err instanceof ApiError ? tm(err.message) : t('loyalty.rewards.donate.failed'),
          'error',
        ),
    });
  };
  return (
    <form
      onSubmit={submit}
      data-testid={TEST_IDS.donatePoints}
      className="mt-3 flex flex-col gap-2 rounded-card border-2 border-line p-4"
    >
      <p>
        {t('loyalty.rewards.donate.giveTo')}{' '}
        <Link to="/charity" className="font-semibold text-primary-strong underline">
          {total?.charity.name ?? 'Whisker Hollow Rescue'}
        </Link>
        {t('loyalty.rewards.donate.aboutShelter')}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="donate-points" className="sr-only">
          {t('loyalty.rewards.donate.label')}
        </label>
        <input
          id="donate-points"
          type="number"
          inputMode="numeric"
          min={1}
          max={balance}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="min-h-11 w-32 rounded-control border-2 border-line bg-surface px-3"
        />
        <Button type="submit" variant="secondary" disabled={!valid} loading={donate.isPending}>
          {t('loyalty.rewards.donate.button')}
        </Button>
      </div>
    </form>
  );
}

function RewardCard({ reward, balance }: { reward: Reward; balance: number }) {
  const redeem = useRedeemReward();
  const toast = useToast();
  const { t, tm } = useT();
  const short = reward.costPoints - balance;
  return (
    <li
      data-testid={TEST_IDS.rewardCard}
      className="flex flex-col gap-2 rounded-card border-2 border-line bg-surface p-4"
    >
      <h4 className="font-display text-lg font-bold">{reward.name}</h4>
      <p className="min-w-0 break-words text-sm text-muted">{reward.description}</p>
      <p className="font-semibold">{t('loyalty.rewards.cost', { points: reward.costPoints })}</p>
      <Button
        className="mt-auto"
        data-testid={TEST_IDS.rewardRedeem}
        disabled={short > 0}
        loading={redeem.isPending}
        onClick={() =>
          redeem.mutate(reward.id, {
            onSuccess: (r) =>
              toast.show(t('loyalty.rewards.redeem.code', { code: r.code.code }), 'success'),
            onError: (e) =>
              toast.show(
                e instanceof ApiError ? tm(e.message) : t('loyalty.rewards.redeem.failed'),
                'error',
              ),
          })
        }
      >
        {short > 0
          ? t('loyalty.rewards.redeem.morePoints', { short })
          : t('loyalty.rewards.redeem.button')}
        <span className="sr-only"> {t('loyalty.rewards.redeem.for', { name: reward.name })}</span>
      </Button>
    </li>
  );
}

// /account/rewards: balance and tier, what the points can buy, the codes already bought, and the
// ledger (every row is a line on the statement; nothing is edited, only added).
export function RewardsSection() {
  const points = usePoints();
  const rewards = useRewards();
  const codes = useMyCodes();
  const data = points.data;
  const { t } = useT();
  const fmt = useFormat();

  return (
    <section aria-labelledby="rewards-heading" data-testid="account-rewards">
      <Seo title={t('loyalty.rewards.title')} noindex />
      <h2 id="rewards-heading" className="font-display text-2xl font-bold">
        {t('loyalty.rewards.title')}
      </h2>

      {points.isPending && !points.error && <Skeleton className="mt-4 h-28 w-full rounded-card" />}
      {points.error && !data && (
        <div className="mt-4" role="alert">
          <p className="font-semibold text-danger">{t('loyalty.rewards.pointsError')}</p>
          <Button className="mt-2" variant="secondary" onClick={() => void points.refetch()}>
            {t('loyalty.rewards.retry')}
          </Button>
        </div>
      )}

      {data && (
        <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-card bg-pet-soft p-4">
          <div>
            <p className="text-sm text-muted">{t('loyalty.rewards.balance')}</p>
            <p className="font-display text-4xl font-bold" data-testid={TEST_IDS.pointsBalance}>
              {data.balance}
              <span className="ml-1 text-base font-semibold">
                {t('loyalty.rewards.pointsUnit')}
              </span>
            </p>
            <p className="text-sm text-muted">
              {t('loyalty.rewards.worth', { amount: fmt.money(Math.max(0, data.balance)) })}
            </p>
          </div>
          <div className="min-w-0">
            <Badge tone="primary" data-testid={TEST_IDS.pointsTier}>
              {data.tier.label}
            </Badge>
            <p className="mt-1 text-sm">
              {t(
                data.tier.ratePercent === 100
                  ? 'loyalty.rewards.earnRateOne'
                  : 'loyalty.rewards.earnRatePercent',
                { percent: data.tier.ratePercent },
              )}
            </p>
            {data.nextTier ? (
              <p className="text-sm text-muted">
                {t('loyalty.rewards.nextTier', {
                  points: data.nextTier.pointsNeeded,
                  label: data.nextTier.label,
                })}
              </p>
            ) : (
              <p className="text-sm text-muted">{t('loyalty.rewards.topTier')}</p>
            )}
          </div>
        </div>
      )}

      <h3 className="mt-8 font-display text-xl font-bold">{t('loyalty.rewards.spendTitle')}</h3>
      {rewards.isPending && <Skeleton className="mt-3 h-32 w-full rounded-card" />}
      {rewards.error && <p className="mt-3 text-danger">{t('loyalty.rewards.rewardsError')}</p>}
      {rewards.data && rewards.data.length === 0 && (
        <p className="mt-3 text-muted">{t('loyalty.rewards.noRewards')}</p>
      )}
      {rewards.data && rewards.data.length > 0 && (
        <ul className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {rewards.data.map((r) => (
            <RewardCard key={r.id} reward={r} balance={data?.balance ?? 0} />
          ))}
        </ul>
      )}

      <h3 className="mt-8 font-display text-xl font-bold">{t('loyalty.rewards.giveAwayTitle')}</h3>
      <DonateBox balance={Math.max(0, data?.balance ?? 0)} />

      <ReferralPanel />

      <h3 className="mt-8 font-display text-xl font-bold">{t('loyalty.rewards.codesTitle')}</h3>
      {codes.data && codes.data.length === 0 && (
        <p className="mt-3 text-muted">{t('loyalty.rewards.codesEmpty')}</p>
      )}
      {codes.data && codes.data.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {codes.data.map((c) => (
            <li
              key={c.code}
              data-testid={TEST_IDS.personalCode}
              className="flex flex-wrap items-baseline justify-between gap-2 rounded-control border-2 border-line px-3 py-2"
            >
              <span className="font-mono font-bold">{c.code}</span>
              <span className="min-w-0 break-words text-sm">
                {codeValue(c, t, fmt)}
                {c.minSpendCents > 0 &&
                  t('loyalty.rewards.code.minSpend', { amount: fmt.money(c.minSpendCents) })}
              </span>
              <span className="text-sm text-muted">
                {c.used
                  ? t('loyalty.rewards.code.used')
                  : c.endsAt
                    ? t('loyalty.rewards.code.validUntil', { date: fmt.date(c.endsAt) })
                    : t('loyalty.rewards.code.noExpiry')}
              </span>
            </li>
          ))}
        </ul>
      )}

      <h3 className="mt-8 font-display text-xl font-bold">{t('loyalty.rewards.historyTitle')}</h3>
      {data && data.entries.length === 0 && (
        <p className="mt-3 text-muted">{t('loyalty.rewards.historyEmpty')}</p>
      )}
      {data && data.entries.length > 0 && (
        <div className="relative mt-3 overflow-x-auto rounded-card border border-line">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{t('loyalty.rewards.historyCaption')}</caption>
            <thead className="bg-bg">
              <tr>
                <th className="p-3">{t('loyalty.rewards.colDate')}</th>
                <th className="p-3">{t('loyalty.rewards.colWhat')}</th>
                <th className="p-3 text-right">{t('loyalty.rewards.colPoints')}</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((e) => (
                <tr
                  key={e.id}
                  className="border-t border-line"
                  data-testid={TEST_IDS.pointsLedgerRow}
                >
                  <td className="whitespace-nowrap p-3">{fmt.date(e.createdAt)}</td>
                  <td className="min-w-0 break-words p-3">
                    {t(KIND_LABEL[e.kind])}
                    {e.orderNumber ? ` · ${e.orderNumber}` : ''}
                    {e.reason && !e.orderNumber ? ` · ${e.reason}` : ''}
                  </td>
                  <td
                    className={`p-3 text-right font-semibold ${e.delta > 0 ? 'text-success' : ''}`}
                  >
                    {e.delta > 0 ? `+${e.delta}` : e.delta}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
