import type { ProductDetail, Variant } from '@store/shared';
import { useLocation, useNavigate } from 'react-router-dom';

import { Tabs, type TabItem } from '../../../components/ui/Tabs';
import { TEST_IDS } from '../../../lib/test-ids';

import { DeliveryPanel } from './DeliveryPanel';
import { FaqAccordion } from './FaqAccordion';
import { FeedingCalculator } from './FeedingCalculator';
import { FeedingTable } from './FeedingTable';
import { SpecsPanel } from './SpecsPanel';

export const TAB_IDS = ['description', 'specs', 'feeding', 'delivery'] as const;
export type ProductTabId = (typeof TAB_IDS)[number];

// Which tabs this product has. A tab with nothing to show is left out (a toy has no feeding
// guide), so the strip never offers an empty panel.
export function availableTabs(
  product: ProductDetail,
  variant: Variant | undefined,
): ProductTabId[] {
  const hasSpecs =
    product.specs.length > 0 || product.faqs.length > 0 || (variant?.constituents.length ?? 0) > 0;
  return [
    'description',
    ...(hasSpecs ? (['specs'] as const) : []),
    ...(product.feedingTable.length > 0 ? (['feeding'] as const) : []),
    'delivery',
  ];
}

// The tab lives in the URL hash (#feeding), so a link opens that tab and Back does not step
// through every click (replace). An unknown or unavailable hash falls back to the first tab.
export function tabFromHash(hash: string, available: readonly ProductTabId[]): ProductTabId {
  const id = hash.replace(/^#/, '');
  return available.find((t) => t === id) ?? 'description';
}

const LABELS: Record<ProductTabId, string> = {
  description: 'Description',
  specs: 'Specs',
  feeding: 'Feeding guide',
  delivery: 'Delivery & returns',
};

export function ProductTabs({
  product,
  variant,
  attributes,
  onPickVariant,
}: {
  product: ProductDetail;
  variant: Variant | undefined;
  attributes: React.ReactNode;
  /** Called when the feeding calculator suggests another pack size. */
  onPickVariant: (variant: Variant) => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const available = availableTabs(product, variant);
  const selected = tabFromHash(location.hash, available);

  const panels: Record<ProductTabId, React.ReactNode> = {
    description: (
      <div className="flex max-w-prose flex-col gap-4">
        <p className="text-lg">{product.description}</p>
        {attributes}
      </div>
    ),
    specs: (
      <>
        <SpecsPanel
          specs={product.specs}
          constituents={variant?.constituents ?? []}
          {...(variant && { variantName: variant.name })}
        />
        <FaqAccordion faqs={product.faqs} />
      </>
    ),
    feeding: (
      <div className="flex flex-col gap-6">
        <FeedingCalculator product={product} variant={variant} onPickVariant={onPickVariant} />
        <FeedingTable rows={product.feedingTable} />
      </div>
    ),
    delivery: <DeliveryPanel note={product.deliveryNote} />,
  };

  const tabs: TabItem[] = available.map((id) => ({ id, label: LABELS[id], panel: panels[id] }));
  return (
    <div data-testid={TEST_IDS.productTabs} className="mt-10">
      <Tabs
        label="Product information"
        tabs={tabs}
        selectedId={selected}
        onSelect={(id) =>
          // replace + keep the query (`?variant=`): switching tabs is not navigation.
          navigate(
            { pathname: location.pathname, search: location.search, hash: `#${id}` },
            { replace: true, preventScrollReset: true },
          )
        }
      />
    </div>
  );
}
