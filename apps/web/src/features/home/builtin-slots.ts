import { createElement } from 'react';

import { readRecentlyViewed } from '../../lib/recently-viewed';
import { RecentlyViewed } from '../catalog/pdp/RecentlyViewed';
import { ShortDatedShelf } from '../expiry/ShortDatedShelf';
import { SeasonalCollectionSlot } from '../merchandising/SeasonalCollectionSlot';
import { NewsletterSlot } from '../newsletter/NewsletterSlot';

import { UsualsPlaceholder } from './HomeSections';
import { registerHomeSlot } from './slots';

// Slots whose component already exists. The phases that add the others (recently viewed,
// newsletter) register theirs the same way, from their own feature folder.
registerHomeSlot({ id: 'seasonal', render: () => createElement(SeasonalCollectionSlot) });

// G6: the store's short-dated deals; the shelf renders nothing when the store has none.
registerHomeSlot({ id: 'short-dated', render: () => createElement(ShortDatedShelf) });

// Phase 16: the visitor's own recently viewed products. Nothing renders for a first-time visitor
// (the synchronous check below) and the strip drops itself if none of the ids is still on sale.
registerHomeSlot({
  id: 'recently-viewed',
  enabled: () => readRecentlyViewed().length > 0,
  render: () => createElement(RecentlyViewed),
});

// Phase 19: the newsletter sign-up (double opt-in, welcome code after the confirming click).
registerHomeSlot({ id: 'newsletter', render: () => createElement(NewsletterSlot) });

// G3: the "Your usuals" placeholder. Registered but switched off (`enabled` is false) so the page
// shows nothing until the reorder phase (G9) has an order history to build it from.
registerHomeSlot({
  id: 'usuals',
  enabled: () => false,
  render: () => createElement(UsualsPlaceholder),
});
