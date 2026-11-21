import { PICK_ZONES, type PickLine, type PickListEntry, type PickZone } from '@store/shared';

// The walk, as pure functions over plain lines (the service only loads the facts). A packer walks the
// store once for a batch of orders, so the list is every line of every selected bag, merged per
// product and sorted: ambient first, then chilled, then frozen (cold food is out of the fridge for
// the shortest time), inside a zone by aisle, then by product name.

const zoneRank = (zone: PickZone): number => PICK_ZONES.indexOf(zone);

// A product sits somewhere in every store; if the layout has no aisle for it yet it goes last in its
// zone, not missing from the list.
const aisleRank = (aisle: number | null): number => aisle ?? Number.MAX_SAFE_INTEGER;

export function compareWalk(
  a: Pick<PickListEntry, 'zone' | 'aisle' | 'productName' | 'variantName'>,
  b: Pick<PickListEntry, 'zone' | 'aisle' | 'productName' | 'variantName'>,
): number {
  return (
    zoneRank(a.zone) - zoneRank(b.zone) ||
    aisleRank(a.aisle) - aisleRank(b.aisle) ||
    a.productName.localeCompare(b.productName, 'en') ||
    a.variantName.localeCompare(b.variantName, 'en')
  );
}

// Which zone a product without an aisle row falls back to: how it is kept.
export const zoneOfStorage = (storage: string | undefined): PickZone =>
  storage === 'chilled' || storage === 'frozen' ? storage : 'ambient';

export function buildPickList(lines: PickLine[]): PickListEntry[] {
  // Same variant (and the same zone: a kit and its parts are different variants) = one stop.
  const entries = new Map<string, PickListEntry>();
  for (const line of lines) {
    const key = `${line.sku}|${line.productName}|${line.variantName}`;
    let entry = entries.get(key);
    if (!entry) {
      entry = {
        key,
        zone: line.zone,
        aisle: line.aisle,
        productName: line.productName,
        variantName: line.variantName,
        sku: line.sku,
        imageUrl: line.imageUrl,
        weighed: line.weighed,
        totalQty: 0,
        remainingQty: 0,
        stops: [],
      };
      entries.set(key, entry);
    }
    entry.totalQty += line.quantity;
    if (!line.resolved) entry.remainingQty += line.quantity;
    entry.stops.push({
      itemId: line.itemId,
      orderNumber: line.orderNumber,
      bag: line.bag,
      quantity: line.quantity,
      resolved: line.resolved,
      batches: line.batches,
    });
  }
  const list = [...entries.values()];
  for (const e of list) e.stops.sort((a, b) => a.bag - b.bag);
  return list.sort(compareWalk);
}

/** A line is done when it is picked, weighed (if sold by weight) or settled as short/missing. */
export function isLineResolved(
  line: Pick<PickLine, 'pickStatus' | 'pickedQty' | 'weighed' | 'packedGrams' | 'swapStatus'>,
): boolean {
  // A replacement the shopper refused is never packed.
  if (line.swapStatus === 'rejected') return true;
  if (line.pickStatus === 'pending') return false;
  if (line.pickStatus === 'missing') return true;
  // A weighed line needs its grams once some units are in the bag.
  if (line.weighed && line.packedGrams === null) return false;
  return true;
}
