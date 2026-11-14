import type { CustomerReturn } from '@store/shared';

import type { ReturnItemWithLine, ReturnRow } from './repo.ts';

// The one place a database return becomes the `CustomerReturn` the web reads.
export function toReturnDto(
  row: ReturnRow,
  orderNumber: string,
  items: ReturnItemWithLine[],
): CustomerReturn {
  const iso = (d: Date | null) => d?.toISOString() ?? null;
  return {
    id: row.id,
    orderNumber,
    status: row.status,
    reason: row.reason,
    note: row.note,
    rejectReason: row.rejectReason,
    refundCents: row.refundCents,
    refundShipping: row.refundShipping,
    simulated: row.simulated,
    items: items
      .filter((i) => i.returnId === row.id)
      .map((i) => ({
        id: i.id,
        orderItemId: i.orderItemId,
        productName: i.productName,
        variantName: i.variantName,
        imageUrl: i.imageUrl,
        quantity: i.quantity,
        reason: i.reason,
        refundCents: i.refundCents,
      })),
    createdAt: row.createdAt.toISOString(),
    approvedAt: iso(row.approvedAt),
    receivedAt: iso(row.receivedAt),
    refundedAt: iso(row.refundedAt),
  };
}
