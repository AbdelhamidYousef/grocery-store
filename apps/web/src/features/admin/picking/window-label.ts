import { formatSlotRange, type PickingOrder } from '@store/shared';

export const windowLabel = (
  order: Pick<PickingOrder, 'deliveryKind' | 'deliveryFrom' | 'deliveryTo'>,
) =>
  order.deliveryKind === 'express'
    ? 'Express'
    : order.deliveryFrom && order.deliveryTo
      ? formatSlotRange(new Date(order.deliveryFrom), new Date(order.deliveryTo))
      : 'No window';
