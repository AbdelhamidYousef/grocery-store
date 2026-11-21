import { type OrderStatus } from '@store/shared';

const DAY_MS = 86_400_000;

export interface EligibleLine {
  id: string;
  quantity: number;
  lineTotalCents: number;
  discountCents: number;
  // Substitutions (G7): units the packer found (null: all), and a replacement the shopper refused.
  pickedQty?: number | null;
  swapStatus?: 'proposed' | 'accepted' | 'rejected' | null;
}

export interface EligibilityResult {
  eligible: boolean;
  reason: string | null;
  deadline: Date | null;
  /** Units of each line that can still be put in a new return. */
  returnable: Map<string, number>;
}

// Pure, so the rules read in one place and test without a database. The order must be delivered
// and still inside the window; each line offers what is not yet in an open or finished return, and
// a line the customer paid nothing for (a gift) offers nothing.
export function assessEligibility(input: {
  status: OrderStatus;
  deliveredAt: Date | null;
  windowDays: number;
  now: Date;
  lines: EligibleLine[];
  /** Units per order line already in a return that is not rejected. */
  counted: ReadonlyMap<string, number>;
}): EligibilityResult {
  const returnable = new Map(
    input.lines.map((l) => {
      const paid = l.lineTotalCents - l.discountCents;
      // Only what was packed and kept can come back: not the units that were missing, and nothing
      // of a replacement refused (before dispatch it was never charged, at the door it was refunded).
      const kept = l.swapStatus === 'rejected' ? 0 : (l.pickedQty ?? l.quantity);
      const left = paid > 0 ? Math.max(0, kept - (input.counted.get(l.id) ?? 0)) : 0;
      return [l.id, left] as const;
    }),
  );
  const deadline = input.deliveredAt
    ? new Date(input.deliveredAt.getTime() + input.windowDays * DAY_MS)
    : null;
  const none = (reason: string): EligibilityResult => ({
    eligible: false,
    reason,
    deadline,
    returnable,
  });

  if (input.status !== 'delivered') return none('Only a delivered order can be returned');
  if (deadline && input.now.getTime() > deadline.getTime()) {
    return none(`The ${input.windowDays}-day return window has closed`);
  }
  if (![...returnable.values()].some((n) => n > 0)) {
    const anyPaid = input.lines.some((l) => l.lineTotalCents - l.discountCents > 0);
    return none(
      anyPaid
        ? 'Every item in this order is already in a return'
        : 'This order has no paid items to return',
    );
  }
  return { eligible: true, reason: null, deadline, returnable };
}
