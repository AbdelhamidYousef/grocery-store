import {
  returnLineRefundCents,
  type CustomerReturn,
  type OrderReturns,
  type ReturnRequestBody,
} from '@store/shared';

import { db } from '../../db/client.ts';
import { conflict, notFound, unprocessable } from '../../lib/errors.ts';
import * as checkoutRepo from '../checkout/repo.ts';

import type { ReturnsConfig } from './config.ts';
import { assessEligibility } from './eligibility.ts';
import * as repo from './repo.ts';
import { toReturnDto } from './view.ts';

// A guest cannot return (owner only): the order must belong to the signed-in user. Anything else,
// including somebody else's order, is the same 404 as a number that does not exist.
async function findOwnOrder(userId: string, number: string) {
  const order = await checkoutRepo.findOrderByNumber(number);
  if (!order || order.userId !== userId) throw notFound('Order not found');
  return order;
}

export async function listForOrder(
  userId: string,
  number: string,
  cfg: ReturnsConfig,
): Promise<OrderReturns> {
  const order = await findOwnOrder(userId, number);
  const [lines, counted, delivered, rows] = await Promise.all([
    checkoutRepo.listOrderItems(db, order.id),
    repo.countedQuantities(db, order.id),
    repo.deliveredAt(db, order.id),
    repo.listByOrder(db, order.id),
  ]);
  const items = await repo.listItems(
    db,
    rows.map((r) => r.id),
  );
  const result = assessEligibility({
    status: order.status,
    deliveredAt: delivered,
    windowDays: cfg.windowDays,
    now: new Date(),
    lines,
    counted,
  });
  return {
    returns: rows.map((r) => toReturnDto(r, order.number, items)),
    eligibility: {
      eligible: result.eligible,
      reason: result.reason,
      deadline: result.deadline?.toISOString() ?? null,
      lines: lines.map((l) => ({
        orderItemId: l.id,
        returnableQuantity: result.returnable.get(l.id) ?? 0,
        paidCents: Math.floor((l.lineTotalCents - l.discountCents) / l.quantity),
      })),
    },
  };
}

// Creates a return request. Everything is decided inside one transaction that holds the ORDER row
// lock, so two requests for the same units (a double click, two tabs) queue: the second one sees
// the first one's lines as already counted and is refused instead of both being accepted.
export async function requestReturn(
  userId: string,
  number: string,
  body: ReturnRequestBody,
  cfg: ReturnsConfig,
): Promise<CustomerReturn> {
  const seen = await findOwnOrder(userId, number);
  return db.transaction(async (tx) => {
    const order = await checkoutRepo.lockOrder(tx, seen.id);
    if (!order) throw notFound('Order not found');
    const lines = await checkoutRepo.listOrderItems(tx, order.id);
    const counted = await repo.countedQuantities(tx, order.id);
    const result = assessEligibility({
      status: order.status,
      deliveredAt: await repo.deliveredAt(tx, order.id),
      windowDays: cfg.windowDays,
      now: new Date(),
      lines,
      counted,
    });
    if (!result.eligible)
      throw conflict('CONFLICT', result.reason ?? 'This order cannot be returned');

    const byId = new Map(lines.map((l) => [l.id, l]));
    const asked = new Set<string>();
    const items = body.items.map((item) => {
      const line = byId.get(item.orderItemId);
      if (!line) throw unprocessable('That item is not part of this order');
      if (asked.has(line.id)) throw unprocessable('List each item once, with its quantity');
      asked.add(line.id);
      if (line.lineTotalCents - line.discountCents <= 0) {
        throw unprocessable(`${line.productName} was free, so it cannot be returned`);
      }
      const left = result.returnable.get(line.id) ?? 0;
      if (item.quantity > left) {
        throw unprocessable(
          left === 0
            ? `${line.productName} is already in a return`
            : `You can return at most ${left} of ${line.productName}`,
          { orderItemId: line.id, returnable: left },
        );
      }
      return {
        orderItemId: line.id,
        quantity: item.quantity,
        reason: item.reason ?? body.reason,
        refundCents: returnLineRefundCents(line, counted.get(line.id) ?? 0, item.quantity),
      };
    });

    const row = await repo.insertReturn(
      tx,
      {
        orderId: order.id,
        userId,
        reason: body.reason,
        note: body.note,
        refundCents: items.reduce((sum, i) => sum + i.refundCents, 0),
      },
      items,
    );
    return toReturnDto(row, order.number, await repo.listItems(tx, [row.id]));
  });
}
