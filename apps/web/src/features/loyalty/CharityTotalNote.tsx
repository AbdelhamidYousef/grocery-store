import { Link } from 'react-router-dom';

import { useT } from '../../i18n';
import { useFormat } from '../../i18n/format';
import { TEST_IDS } from '../../lib/test-ids';

import { useCharityTotal } from './queries';

// One quiet line in the footer. Hidden while loading or on error: it is never worth a spinner.
export function CharityTotalNote() {
  const { data } = useCharityTotal();
  const { t } = useT();
  const fmt = useFormat();
  if (!data) return null;
  return (
    <p className="max-w-xs text-sm text-surface" data-testid={TEST_IDS.charityTotal}>
      <Link to="/charity" className="font-semibold underline underline-offset-2">
        {data.charity.name}
      </Link>{' '}
      {t('loyalty.charityNote.text', { amount: fmt.money(data.totalCents) })}
    </p>
  );
}
