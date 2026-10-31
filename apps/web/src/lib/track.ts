// Analytics hook stub. Pages call `track()` at the moments a later analytics project (GA4 / CRO)
// cares about; today it only logs in dev and does nothing in production, so wiring a real
// provider later is a change to this one file and never to the pages. The event union is typed so
// a payload cannot drift from what the pages send.
export interface TrackItem {
  id: string;
  name: string;
  price?: number;
  variant?: string;
}

export type AnalyticsEvent =
  | { name: 'view_home' }
  | { name: 'view_item_list'; listId: string; items: TrackItem[] }
  | { name: 'view_item'; item: TrackItem }
  | { name: 'add_to_cart'; item: TrackItem; quantity: number }
  | { name: 'remove_from_cart'; item: TrackItem; quantity: number }
  // Money fields are integer cents like everywhere else; a provider adapter converts if it must.
  | { name: 'begin_checkout'; valueCents: number; currency: string; items: TrackItem[] }
  | { name: 'add_payment_info'; valueCents: number; currency: string; shippingMethod: string }
  | {
      name: 'purchase';
      orderNumber: string;
      valueCents: number;
      currency: string;
      items: TrackItem[];
    };

export function track(event: AnalyticsEvent): void {
  if (import.meta.env.DEV) {
    console.debug('[track]', event.name, event);
  }
}
