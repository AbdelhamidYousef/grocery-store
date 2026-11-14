import type { OrderStatus } from '@store/shared';

import { Badge } from '../../components/ui/Badge';
import { useT } from '../../i18n';
import { TEST_IDS } from '../../lib/test-ids';

import { STATUS_KEY, STATUS_TONE } from './order-status';

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useT();
  return (
    <Badge tone={STATUS_TONE[status]} data-testid={TEST_IDS.orderStatusBadge} data-status={status}>
      {t(STATUS_KEY[status])}
    </Badge>
  );
}
