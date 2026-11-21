import type { OrderStatus } from '@store/shared';

import { Badge } from '../../components/ui/Badge';
import { useT } from '../../i18n';
import { TEST_IDS } from '../../lib/test-ids';

import { STATUS_KEY, STATUS_TONE } from './order-status';

// `captured`: the money was really taken (only a paid order can be both secured and charged).
export function OrderStatusBadge({
  status,
  captured = false,
}: {
  status: OrderStatus;
  captured?: boolean;
}) {
  const { t } = useT();
  return (
    <Badge tone={STATUS_TONE[status]} data-testid={TEST_IDS.orderStatusBadge} data-status={status}>
      {t(status === 'paid' && captured ? 'account.status.charged' : STATUS_KEY[status])}
    </Badge>
  );
}
