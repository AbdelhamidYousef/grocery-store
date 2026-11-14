import type { ReturnStatus } from '@store/shared';

import type { BadgeTone } from '../../../components/ui/Badge';

export const RETURN_TONE: Record<ReturnStatus, BadgeTone> = {
  requested: 'neutral',
  approved: 'primary',
  rejected: 'danger',
  received: 'primary',
  refunded: 'success',
};
