import { formatMoney } from '@store/shared';
import { Link } from 'react-router-dom';

import { TEST_IDS } from '../../lib/test-ids';

import { useCharityTotal } from './queries';

// One quiet line in the footer. Hidden while loading or on error: it is never worth a spinner.
export function CharityTotalNote() {
  const { data } = useCharityTotal();
  if (!data) return null;
  return (
    <p className="max-w-xs text-sm text-surface" data-testid={TEST_IDS.charityTotal}>
      <Link to="/charity" className="font-semibold underline underline-offset-2">
        {data.charity.name}
      </Link>{' '}
      (a pretend shelter) has received {formatMoney(data.totalCents, 'EUR')} so far. Demo only: no
      money moves.
    </p>
  );
}
