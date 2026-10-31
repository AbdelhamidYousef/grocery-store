import type { OrderStatus } from '@store/shared';

import { Badge } from '../../components/ui/Badge';
import { TEST_IDS } from '../../lib/test-ids';

import { STATUS_LABEL, STATUS_TONE } from './order-status';

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge tone={STATUS_TONE[status]} data-testid={TEST_IDS.orderStatusBadge} data-status={status}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}
