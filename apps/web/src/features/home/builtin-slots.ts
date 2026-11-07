import { createElement } from 'react';

import { SeasonalCollectionSlot } from '../merchandising/SeasonalCollectionSlot';

import { registerHomeSlot } from './slots';

// Slots whose component already exists. The phases that add the others (recently viewed, gallery,
// newsletter) register theirs the same way, from their own feature folder.
registerHomeSlot({ id: 'seasonal', render: () => createElement(SeasonalCollectionSlot) });
