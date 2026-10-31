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
  | { name: 'add_to_cart'; item: TrackItem; quantity: number };

export function track(event: AnalyticsEvent): void {
  if (import.meta.env.DEV) {
    console.debug('[track]', event.name, event);
  }
}
