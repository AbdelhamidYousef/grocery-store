import { formatMoney, type PersonalCode, type PointKind, type Reward } from '@store/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { ApiError } from '../../api/client';
import { Seo } from '../../components/Seo';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { formatDate } from '../../lib/format';
import { TEST_IDS } from '../../lib/test-ids';

import {
  useCharityTotal,
  useDonatePoints,
  useMyCodes,
  usePoints,
  useRedeemReward,
  useRewards,
} from './queries';

const KIND_LABEL: Record<PointKind, string> = {
  earn: 'Earned',
  redeem: 'Spent',
  reversal: 'Returned or taken back',
  bonus: 'Bonus',
  donate: 'Donated',
  adjust: 'Adjustment',
};

const codeValue = (c: PersonalCode) =>
  c.kind === 'free_shipping'
    ? 'Free delivery'
    : c.kind === 'fixed'
      ? `${formatMoney(c.value, 'EUR')} off`
      : `${c.value}% off`;

// Give points to the (pretend) shelter: 1 point = 1 cent.
function DonateBox({ balance }: { balance: number }) {
  const donate = useDonatePoints();
  const toast = useToast();
  const total = useCharityTotal().data;
  const [text, setText] = useState('');
  const points = Number.parseInt(text, 10);
  const valid = Number.isInteger(points) && points >= 1 && points <= balance;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    donate.mutate(points, {
      onSuccess: () => {
        toast.show(`Thank you! ${points} points went to the shelter.`, 'success');
        setText('');
      },
      onError: (err) =>
        toast.show(err instanceof ApiError ? err.message : 'We could not donate that.', 'error'),
    });
  };
  return (
    <form
      onSubmit={submit}
      data-testid={TEST_IDS.donatePoints}
      className="mt-3 flex flex-col gap-2 rounded-card border-2 border-line p-4"
    >
      <p>
        Give points to{' '}
        <Link to="/charity" className="font-semibold text-primary-strong underline">
          {total?.charity.name ?? 'Whisker Hollow Rescue'}
        </Link>
        , a pretend shelter (1 point = 1 cent; demo only, no money moves).
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="donate-points" className="sr-only">
          Points to donate
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
          Donate
        </Button>
      </div>
    </form>
  );
}

function RewardCard({ reward, balance }: { reward: Reward; balance: number }) {
  const redeem = useRedeemReward();
  const toast = useToast();
  const short = reward.costPoints - balance;
  return (
    <li
      data-testid={TEST_IDS.rewardCard}
      className="flex flex-col gap-2 rounded-card border-2 border-line bg-surface p-4"
    >
      <h4 className="font-display text-lg font-bold">{reward.name}</h4>
      <p className="min-w-0 break-words text-sm text-muted">{reward.description}</p>
      <p className="font-semibold">{reward.costPoints} points</p>
      <Button
        className="mt-auto"
        data-testid={TEST_IDS.rewardRedeem}
        disabled={short > 0}
        loading={redeem.isPending}
        onClick={() =>
          redeem.mutate(reward.id, {
            onSuccess: (r) => toast.show(`Your code is ${r.code.code}`, 'success'),
            onError: (e) =>
              toast.show(e instanceof ApiError ? e.message : 'We could not redeem that.', 'error'),
          })
        }
      >
        {short > 0 ? `${short} more points` : 'Redeem'}
        <span className="sr-only"> for {reward.name}</span>
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

  return (
    <section aria-labelledby="rewards-heading" data-testid="account-rewards">
      <Seo title="Rewards" noindex />
      <h2 id="rewards-heading" className="font-display text-2xl font-bold">
        Rewards
      </h2>

      {points.isPending && !points.error && <Skeleton className="mt-4 h-28 w-full rounded-card" />}
      {points.error && !data && (
        <div className="mt-4" role="alert">
          <p className="font-semibold text-danger">We could not load your points.</p>
          <Button className="mt-2" variant="secondary" onClick={() => void points.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {data && (
        <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-card bg-pet-soft p-4">
          <div>
            <p className="text-sm text-muted">Your balance</p>
            <p className="font-display text-4xl font-bold" data-testid={TEST_IDS.pointsBalance}>
              {data.balance}
              <span className="ml-1 text-base font-semibold">points</span>
            </p>
            <p className="text-sm text-muted">
              Worth {formatMoney(Math.max(0, data.balance), 'EUR')} at checkout
            </p>
          </div>
          <div className="min-w-0">
            <Badge tone="primary" data-testid={TEST_IDS.pointsTier}>
              {data.tier.label}
            </Badge>
            <p className="mt-1 text-sm">
              You earn {data.tier.ratePercent === 100 ? '1 point' : `${data.tier.ratePercent}%`} per
              euro spent.
            </p>
            {data.nextTier ? (
              <p className="text-sm text-muted">
                {data.nextTier.pointsNeeded} more earned points to reach {data.nextTier.label}.
              </p>
            ) : (
              <p className="text-sm text-muted">You are at the top tier. Good dog!</p>
            )}
          </div>
        </div>
      )}

      <h3 className="mt-8 font-display text-xl font-bold">Spend your points</h3>
      {rewards.isPending && <Skeleton className="mt-3 h-32 w-full rounded-card" />}
      {rewards.error && <p className="mt-3 text-danger">We could not load the rewards.</p>}
      {rewards.data && rewards.data.length === 0 && (
        <p className="mt-3 text-muted">No rewards are available right now.</p>
      )}
      {rewards.data && rewards.data.length > 0 && (
        <ul className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {rewards.data.map((r) => (
            <RewardCard key={r.id} reward={r} balance={data?.balance ?? 0} />
          ))}
        </ul>
      )}

      <h3 className="mt-8 font-display text-xl font-bold">Or give them away</h3>
      <DonateBox balance={Math.max(0, data?.balance ?? 0)} />

      <h3 className="mt-8 font-display text-xl font-bold">Your codes</h3>
      {codes.data && codes.data.length === 0 && (
        <p className="mt-3 text-muted">
          Codes you buy with points appear here. Apply one in your cart.
        </p>
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
                {codeValue(c)}
                {c.minSpendCents > 0 && `, min spend ${formatMoney(c.minSpendCents, 'EUR')}`}
              </span>
              <span className="text-sm text-muted">
                {c.used ? 'Used' : c.endsAt ? `Valid until ${formatDate(c.endsAt)}` : 'No expiry'}
              </span>
            </li>
          ))}
        </ul>
      )}

      <h3 className="mt-8 font-display text-xl font-bold">Points history</h3>
      {data && data.entries.length === 0 && (
        <p className="mt-3 text-muted">
          No points yet. Every euro you spend on an order earns points.
        </p>
      )}
      {data && data.entries.length > 0 && (
        <div className="relative mt-3 overflow-x-auto rounded-card border border-line">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Your last 50 points movements</caption>
            <thead className="bg-bg">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">What</th>
                <th className="p-3 text-right">Points</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((e) => (
                <tr
                  key={e.id}
                  className="border-t border-line"
                  data-testid={TEST_IDS.pointsLedgerRow}
                >
                  <td className="whitespace-nowrap p-3">{formatDate(e.createdAt)}</td>
                  <td className="min-w-0 break-words p-3">
                    {KIND_LABEL[e.kind]}
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
