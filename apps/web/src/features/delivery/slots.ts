import {
  formatClock,
  formatSlotDate,
  formatSlotLabel,
  formatSlotRange,
  slotDayKind,
  zonedInstant,
  type CartDelivery,
  type DeliverySlot,
  type OrderDelivery,
  type SlotDay,
} from '@store/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import {
  clearCartDelivery,
  setCartBags,
  setCartExpress,
  setCartSlot,
  type WebCart,
} from '../../api/cart';
import { fetchSlots } from '../../api/delivery';
import type { TFunction } from '../../i18n';
import { keys } from '../../lib/query-client';

// ---------- reading ----------

/**
 * The slots of the shopper's store and whether express is on offer. Refetched when the postcode
 * changes (its key is outside the `delivery` root, see DeliveryContext) and every half minute, so a
 * slot that filled up or closed stops being offered without a reload.
 */
export function useSlots() {
  return useQuery({
    queryKey: keys.slots,
    queryFn: ({ signal }) => fetchSlots(signal),
    staleTime: 20_000,
    refetchInterval: 30_000,
  });
}

/**
 * The server's clock, from this device's clock plus the offset the slots answer reported (a wrong
 * device clock must not decide what is closed). Re-read every `tickMs`, so "Today" turns into
 * "Tomorrow" and a slot that just closed stops being offered without a reload.
 */
export function useServerNow(offsetMs: number, tickMs = 30_000): Date {
  const [device, setDevice] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setDevice(Date.now()), tickMs);
    return () => window.clearInterval(id);
  }, [tickMs]);
  return new Date(device + offsetMs);
}

/** The first slot a shopper can still book, in time order. */
export function firstOpenSlot(days: readonly SlotDay[]): DeliverySlot | undefined {
  return days.flatMap((d) => d.slots).find((s) => s.status === 'open');
}

// ---------- writing ----------

// Every write answers the whole cart, which is stored as the cart; the slots are refetched because
// a booking changes the places left (and a refusal means they changed under the shopper).
function useDeliveryMutation<Variables>(fn: (v: Variables) => Promise<WebCart>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (cart) => {
      queryClient.setQueryData(keys.cart, cart);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: keys.slots });
    },
  });
}

export const useSetSlot = () => useDeliveryMutation((slotId: string) => setCartSlot(slotId));
export const useSetExpress = () => useDeliveryMutation(() => setCartExpress());
export const useSetBags = () => useDeliveryMutation((bags: boolean) => setCartBags(bags));
export const useClearDelivery = () => useDeliveryMutation(() => clearCartDelivery());

// ---------- words ----------

/** "Mon 23 Nov 14:00–15:00": an absolute window for an order (it must not turn into "today"). */
export function windowLabel(from: string, to: string, locale: string): string {
  const start = new Date(from);
  return `${formatSlotDate(start, locale)} ${formatSlotRange(start, new Date(to))}`;
}

/**
 * What the shopper was promised, in words: "Arrives Mon 23 Nov 14:00–15:00", or for express "Express,
 * by 14:30" (the end of the 30-minute window).
 */
export function deliverySentence(
  delivery: OrderDelivery | CartDelivery | null,
  locale: string,
  t: TFunction,
): string | null {
  if (!delivery) return null;
  if ('from' in delivery) {
    if (delivery.kind === 'express') {
      return t('delivery.window.express', {
        time: formatClock(new Date(delivery.to)),
      });
    }
    return t('delivery.window.arrives', { when: windowLabel(delivery.from, delivery.to, locale) });
  }
  if (delivery.kind === 'express') return t('delivery.window.expressCart');
  return delivery.slot
    ? t('delivery.window.arrives', {
        when: windowLabel(delivery.slot.startsAt, delivery.slot.endsAt, locale),
      })
    : null;
}

/** Relative day and hours for picking and for "Next delivery": "Today 14:00–15:00". */
export function slotLabel(slot: DeliverySlot, now: Date, locale: string, sentence = false): string {
  return formatSlotLabel(
    new Date(slot.startsAt),
    new Date(slot.endsAt),
    now,
    locale,
    undefined,
    sentence ? 'sentence' : 'label',
  );
}

/** The tab of one day: "Today", "Tomorrow", then "Wed 25 Nov" (the shop's day, whatever the device zone). */
export function dayTabLabel(dateKey: string, now: Date, locale: string, t: TFunction): string {
  // Noon is inside every shop day, even the 23- and 25-hour ones.
  const noon = zonedInstant(dateKey, 12 * 60);
  const kind = slotDayKind(noon, now);
  if (kind === 'today') return t('delivery.slots.today');
  if (kind === 'tomorrow') return t('delivery.slots.tomorrow');
  return formatSlotDate(noon, locale);
}
