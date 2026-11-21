import type { ProductDetail, Variant } from '@store/shared';
import { useLocation, useNavigate } from 'react-router-dom';

import { Tabs, type TabItem } from '../../../components/ui/Tabs';
import { useT, type StringKey } from '../../../i18n';
import { TEST_IDS } from '../../../lib/test-ids';

import { DeliveryPanel } from './DeliveryPanel';
import { FaqAccordion } from './FaqAccordion';
import { NutritionPanel } from './NutritionPanel';
import { SpecsPanel } from './SpecsPanel';

export const TAB_IDS = ['description', 'nutrition', 'specs', 'delivery'] as const;
export type ProductTabId = (typeof TAB_IDS)[number];

// Which tabs this product has. A tab with nothing to show is left out (a product with no specs
// has no specs tab), so the strip never offers an empty panel.
export function availableTabs(
  product: ProductDetail,
  variant: Variant | undefined,
): ProductTabId[] {
  const hasSpecs =
    product.specs.length > 0 || product.faqs.length > 0 || (variant?.constituents.length ?? 0) > 0;
  return [
    'description',
    // Only food has nutrition, ingredients and allergens; a sponge has no such tab.
    ...(product.food ? (['nutrition'] as const) : []),
    ...(hasSpecs ? (['specs'] as const) : []),
    'delivery',
  ];
}

// The tab lives in the URL hash (#specs), so a link opens that tab and Back does not step
// through every click (replace). An unknown or unavailable hash falls back to the first tab.
export function tabFromHash(hash: string, available: readonly ProductTabId[]): ProductTabId {
  const id = hash.replace(/^#/, '');
  return available.find((t) => t === id) ?? 'description';
}

const LABELS: Record<ProductTabId, StringKey> = {
  description: 'pdp.tabs.description',
  nutrition: 'pdp.tabs.nutrition',
  specs: 'pdp.tabs.specs',
  delivery: 'pdp.tabs.delivery',
};

export function ProductTabs({
  product,
  variant,
  attributes,
}: {
  product: ProductDetail;
  variant: Variant | undefined;
  attributes: React.ReactNode;
}) {
  const { t } = useT();
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
    nutrition: product.food ? (
      <NutritionPanel food={product.food} unit={variant?.netUnit === 'ml' ? 'ml' : 'g'} />
    ) : null,
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
    delivery: <DeliveryPanel note={product.deliveryNote} />,
  };

  const tabs: TabItem[] = available.map((id) => ({ id, label: t(LABELS[id]), panel: panels[id] }));
  return (
    <div data-testid={TEST_IDS.productTabs} className="mt-10">
      <Tabs
        label={t('pdp.tabs.label')}
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
