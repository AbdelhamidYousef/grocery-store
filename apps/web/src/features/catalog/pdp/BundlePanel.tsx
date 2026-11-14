import { formatMoney, type BundleDetail, type KitTeaser } from '@store/shared';
import { Link } from 'react-router-dom';

import { TEST_IDS } from '../../../lib/test-ids';

// On a kit's own page: what is inside, and what buying it together saves. Integer cents all the way.
export function BundlePanel({ bundle, currency }: { bundle: BundleDetail; currency: string }) {
  return (
    <section
      aria-labelledby="bundle-heading"
      data-testid={TEST_IDS.bundlePanel}
      className="flex flex-col gap-2 rounded-card bg-pet-soft p-3"
    >
      <h2 id="bundle-heading" className="font-display text-lg font-bold">
        What is in the kit
      </h2>
      <ul className="flex flex-col gap-1 text-sm">
        {bundle.components.map((c) => (
          <li key={c.variantId} className="flex justify-between gap-3">
            <Link to={`/products/${c.productSlug}`} className="underline">
              {c.qty > 1 ? `${c.qty} x ` : ''}
              {c.productName}
              {c.variantName ? ` (${c.variantName})` : ''}
            </Link>
            <span className="shrink-0">{formatMoney(c.priceCents * c.qty, currency)}</span>
          </li>
        ))}
      </ul>
      {bundle.savingCents > 0 && (
        <p className="font-semibold" data-testid={TEST_IDS.bundleSaving}>
          Save {formatMoney(bundle.savingCents, currency)} vs individually (
          {formatMoney(bundle.individualCents, currency)})
        </p>
      )}
    </section>
  );
}

// On a component's page: the kits that contain this product.
export function KitsBlock({ kits, currency }: { kits: KitTeaser[]; currency: string }) {
  if (kits.length === 0) return null;
  return (
    <section
      aria-labelledby="kits-heading"
      data-testid={TEST_IDS.kitsBlock}
      className="mt-10 rounded-card border-2 border-line p-4 sm:p-6"
    >
      <h2 id="kits-heading" className="font-display text-2xl font-bold">
        Make it a kit
      </h2>
      <ul className="mt-4 flex flex-col gap-3">
        {kits.map((k) => (
          <li key={k.variantId} className="flex flex-wrap items-center justify-between gap-3">
            <span className="min-w-0 break-words">
              <Link to={`/products/${k.slug}`} className="font-semibold underline">
                {k.name}
              </Link>
              <span className="block text-sm text-muted">{k.contents}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="font-bold">{formatMoney(k.priceCents, currency)}</span>
              {k.savingCents > 0 && (
                <span className="block text-sm">Save {formatMoney(k.savingCents, currency)}</span>
              )}
              {!k.available && <span className="block text-sm text-danger">Sold out</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
