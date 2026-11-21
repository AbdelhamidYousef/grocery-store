import type { ReactNode } from 'react';

// The homepage's extension points. This phase owns HomePage; later phases (recently viewed,
// newsletter) only register their component here and never edit the page.
//  - The order is fixed by HOME_SLOT_IDS, not by who registers first, so import order cannot
//    shuffle the page.
//  - A slot nobody registered (or one that says it is not enabled) renders nothing at all.
export const HOME_SLOT_IDS = ['seasonal', 'usuals', 'recently-viewed', 'newsletter'] as const;
export type HomeSlotId = (typeof HOME_SLOT_IDS)[number];

export interface HomeSlot {
  id: HomeSlotId;
  render: () => ReactNode;
  /** Defaults to true. A cheap synchronous check (a feature flag); data checks belong in render. */
  enabled?: () => boolean;
}

const registry = new Map<HomeSlotId, HomeSlot>();

/** Registering the same id twice replaces the first (hot reload, tests). */
export function registerHomeSlot(slot: HomeSlot): void {
  registry.set(slot.id, slot);
}

/** The enabled slots in their fixed order. */
export function getHomeSlots(): HomeSlot[] {
  return HOME_SLOT_IDS.flatMap((id) => {
    const slot = registry.get(id);
    return slot && (slot.enabled?.() ?? true) ? [slot] : [];
  });
}

/** For tests only. */
export function clearHomeSlots(): void {
  registry.clear();
}
