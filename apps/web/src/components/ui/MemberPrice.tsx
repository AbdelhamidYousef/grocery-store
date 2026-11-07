import { formatMoney, type MemberOffer, type SaleOffer } from '@store/shared';
import { Link } from 'react-router-dom';

import { useIsSignedIn } from '../../features/auth/AuthProvider';
import { cn } from '../../lib/cn';
import { loginUrl } from '../../lib/safe-next';
import { TEST_IDS } from '../../lib/test-ids';

// The engine charges min(regular, sale, member) and prices never stack, so the member price is
// what the shopper pays only when it beats a running sale. A sale that is as low or lower wins and
// is shown as the sale (the member line stays out of the way).
export function memberBeatsSale(member: MemberOffer | null, sale: SaleOffer | null): boolean {
  return member !== null && (sale === null || member.priceCents < sale.priceCents);
}

interface MemberPriceProps {
  member: MemberOffer;
  /** The regular price, shown next to it (muted, not struck through: it is not a reduction claim). */
  regularCents?: number;
  currency?: string;
  /** "from" for a card whose variants have different prices. */
  from?: boolean;
  className?: string;
}

export function MemberPrice({ member, regularCents, currency, from, className }: MemberPriceProps) {
  const fmt = (value: number) => formatMoney(value, currency);
  return (
    <span className={cn('flex flex-col', className)} data-testid="price">
      <span className="inline-flex flex-wrap items-baseline gap-x-2">
        <span className="font-display font-bold" data-testid={TEST_IDS.memberPrice}>
          Member price {from && 'from '}
          {fmt(member.priceCents)}
        </span>
      </span>
      {regularCents !== undefined && regularCents > member.priceCents && (
        <span className="text-xs font-normal text-muted">
          Regular price {from && 'from '}
          {fmt(regularCents)}
        </span>
      )}
    </span>
  );
}

// What a guest sees when a member price exists: the number is not in the page at all (the API
// withholds it), only a way to sign in and come straight back. Signed-in shoppers never see it.
export function MemberTeaser({
  show,
  returnTo,
  className,
}: {
  show: boolean;
  returnTo: string;
  className?: string;
}) {
  const signedIn = useIsSignedIn();
  if (!show || signedIn) return null;
  return (
    <Link
      to={loginUrl(returnTo)}
      data-testid={TEST_IDS.memberTeaser}
      className={cn('text-sm font-semibold text-primary-strong underline', className)}
    >
      Member price: log in to see
    </Link>
  );
}
