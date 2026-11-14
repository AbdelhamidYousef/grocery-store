import type { ProductDetail, Variant } from '@store/shared';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { ApiError } from '../api/client';
import { Breadcrumbs, type Crumb } from '../components/layout/Breadcrumbs';
import { Container } from '../components/layout/Container';
import { Seo } from '../components/Seo';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { MemberPrice, MemberTeaser, memberBeatsSale } from '../components/ui/MemberPrice';
import { Price } from '../components/ui/Price';
import { ProductBadges } from '../components/ui/ProductBadges';
import { SalePrice } from '../components/ui/SalePrice';
import { Skeleton } from '../components/ui/Skeleton';
import { UnitPrice, UnitPriceNote } from '../components/ui/UnitPrice';
import { useAddToCartAction } from '../features/cart/queries';
import { AddToCart } from '../features/catalog/AddToCart';
import { formatFacetValue } from '../features/catalog/filters';
import { Gallery } from '../features/catalog/Gallery';
import { BoughtTogether } from '../features/catalog/pdp/BoughtTogether';
import { BundlePanel, KitsBlock } from '../features/catalog/pdp/BundlePanel';
import { DeliveryEstimate } from '../features/catalog/pdp/DeliveryEstimate';
import { faqJsonLd } from '../features/catalog/pdp/FaqAccordion';
import { ProductTabs } from '../features/catalog/pdp/ProductTabs';
import { RecentlyViewed } from '../features/catalog/pdp/RecentlyViewed';
import { RelatedStrip } from '../features/catalog/pdp/RelatedStrip';
import { SizeGuideButton } from '../features/catalog/pdp/SizeGuide';
import { useProduct } from '../features/catalog/queries';
import { variantFromSku } from '../features/catalog/resolve-variant';
import { VariantPicker } from '../features/catalog/VariantPicker';
import { SafetyNoticeBox } from '../features/safety/SafetyNoticeBox';
import { accentForPetAttribute, petBySlug } from '../lib/pets';
import { recordRecentlyViewed } from '../lib/recently-viewed';
import { TEST_IDS } from '../lib/test-ids';
import { track } from '../lib/track';

import NotFoundPage from './NotFoundPage';

const ATTRIBUTE_LABELS: [keyof ProductDetail['attributes'], string][] = [
  ['pet', 'Pet'],
  ['material', 'Material'],
  ['ageStage', 'Age stage'],
  ['size', 'Size'],
  ['brand', 'Brand'],
];

export default function ProductPage() {
  const { slug } = useParams();
  const { data: product, error, isPending, refetch } = useProduct(slug);

  if (error instanceof ApiError && error.status === 404) return <NotFoundPage what="product" />;
  if (error) {
    return (
      <Container className="py-12 text-center" data-testid={TEST_IDS.pageProduct}>
        <Seo title="Something went wrong" noindex />
        <h1 className="text-3xl font-bold">We could not load this product</h1>
        <Button className="mt-4" onClick={() => void refetch()}>
          Try again
        </Button>
      </Container>
    );
  }
  if (isPending) return <ProductSkeleton />;
  return <ProductView product={product} />;
}

function ProductView({ product }: { product: ProductDetail }) {
  // The chosen variant lives in the URL (`?variant=<sku>`), so a link is precise: it opens the
  // exact colour and size that was shared. No parameter means the default variant.
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const variant = variantFromSku(product.variants, params.get('variant'));
  const location = useLocation();
  const cart = useAddToCartAction(product);
  // replace: choosing colours is exploring, not navigating, so Back should leave the product
  // rather than step through every swatch. The hash (open tab) stays.
  const selectVariant = (next: Variant) => {
    const nextParams = new URLSearchParams(location.search);
    nextParams.set('variant', next.sku);
    navigate(
      { pathname: location.pathname, search: `?${nextParams}`, hash: location.hash },
      { replace: true, preventScrollReset: true },
    );
  };
  // Which photo is shown is derived, not synced with an effect: a thumbnail the shopper picked
  // wins for the variant it was picked on; otherwise a variant with its own photo shows it; else
  // the first image. Changing variant therefore swaps the photo with no extra render.
  const [picked, setPicked] = useState<{ imageId: string; variantId: string | undefined }>();
  const variantId = variant?.id;
  const imageId =
    picked && picked.variantId === variantId
      ? picked.imageId
      : (product.images.find((i) => i.variantId === variantId) ?? product.images[0])?.id;

  useEffect(() => {
    track({
      name: 'view_item',
      item: { id: product.id, name: product.name, price: variant?.priceCents },
    });
    // Remembered for the "recently viewed" strips (this browser only).
    recordRecentlyViewed(product.id);
    // One view per product, not per variant change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  const pet = petBySlug(product.breadcrumb[0]?.slug);
  const accent = pet?.accent ?? accentForPetAttribute(product.attributes.pet);
  const crumbs: Crumb[] = [
    { label: 'Home', to: '/' },
    ...product.breadcrumb.map((b) => ({ label: b.name, to: `/c/${b.slug}` })),
    { label: product.name },
  ];
  const attributes = ATTRIBUTE_LABELS.flatMap(([key, label]) => {
    const value = product.attributes[key];
    return value ? [{ label, value: formatFacetValue(key, value) }] : [];
  });

  return (
    <div data-pet={accent} data-testid={TEST_IDS.pageProduct}>
      <Seo
        title={product.name}
        description={product.description.slice(0, 155)}
        canonical={`/products/${product.slug}`}
        {...(faqJsonLd(product.faqs) && { jsonLd: faqJsonLd(product.faqs) })}
      />
      <Container className="py-6">
        <Breadcrumbs items={crumbs} />
        <div className="mt-6 grid grid-cols-1 gap-8 md:grid-cols-2 lg:gap-12">
          <Gallery
            images={product.images}
            selectedId={imageId}
            onSelect={(id) => setPicked({ imageId: id, variantId })}
            soldOut={!product.inStock}
          />

          <div className="flex min-w-0 flex-col gap-5">
            <div>
              <h1 className="break-words font-display text-3xl font-bold sm:text-4xl">
                {product.name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {!product.inStock && (
                  <Badge tone="neutral" className="border-ink bg-surface text-ink">
                    Sold out
                  </Badge>
                )}
                <ProductBadges badges={product.badges} />
              </div>
            </div>

            {product.safetyNotices.map((notice) => (
              <SafetyNoticeBox key={notice.id} notice={notice} />
            ))}

            {variant?.member && memberBeatsSale(variant.member, variant.sale) ? (
              <MemberPrice
                member={variant.member}
                regularCents={variant.priceCents}
                currency={variant.currency}
                className="text-3xl text-pet-strong"
              />
            ) : variant?.sale ? (
              <SalePrice
                sale={variant.sale}
                currency={variant.currency}
                className="text-3xl text-pet-strong"
              />
            ) : variant ? (
              <Price
                cents={variant.priceCents}
                compareAtCents={variant.compareAtPriceCents}
                currency={variant.currency}
                className="text-3xl text-pet-strong"
              />
            ) : (
              <Price
                cents={product.price.minCents}
                maxCents={product.price.maxCents}
                currency={product.price.currency}
                className="text-3xl text-pet-strong"
              />
            )}

            {variant && (
              <MemberTeaser
                show={variant.hasMemberPrice}
                returnTo={`${location.pathname}${location.search}`}
                className="-mt-3"
              />
            )}

            {variant && (
              <div className="-mt-3 flex flex-col gap-1">
                <UnitPrice unitPrice={variant.unitPrice} currency={variant.currency} />
                {variant.unitPrice && <UnitPriceNote />}
                {variant.isTrial && (
                  <div className="mt-1 flex flex-col gap-1">
                    <Badge tone="pet" data-testid={TEST_IDS.trialPill} className="w-fit">
                      Trial size
                    </Badge>
                    <p data-testid={TEST_IDS.trialNote} className="text-sm text-muted">
                      A sample to try before you commit: one per customer. The full size has no
                      limit.
                    </p>
                  </div>
                )}
              </div>
            )}

            {variant && product.optionKeys.length > 0 && (
              <VariantPicker
                optionKeys={product.optionKeys}
                variants={product.variants}
                selected={variant}
                onSelect={selectVariant}
              />
            )}

            {product.sizeGuide && <SizeGuideButton guide={product.sizeGuide} variant={variant} />}

            {product.bundle && (
              <BundlePanel bundle={product.bundle} currency={product.price.currency} />
            )}

            {variant && (
              <p className="text-sm text-muted" data-testid="variant-sku">
                SKU {variant.sku} ·{' '}
                <span
                  className={
                    variant.available ? 'font-semibold text-success' : 'font-semibold text-danger'
                  }
                >
                  {variant.available ? 'In stock' : 'Sold out'}
                </span>
              </p>
            )}

            {variant && (
              <AddToCart
                key={variant.id}
                variant={variant}
                pending={cart.pending}
                onAdd={(quantity) => cart.add(variant, quantity)}
              />
            )}

            {variant?.available && <DeliveryEstimate />}
          </div>
        </div>
        <ProductTabs
          product={product}
          variant={variant}
          onPickVariant={selectVariant}
          attributes={
            <dl
              data-testid={TEST_IDS.productAttributes}
              className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 rounded-card bg-pet-soft p-4"
            >
              {attributes.map(({ label, value }) => (
                <div key={label} className="contents">
                  <dt className="font-semibold text-pet-strong">{label}</dt>
                  <dd className="min-w-0 break-words">{value}</dd>
                </div>
              ))}
              {product.tags.length > 0 && (
                <div className="contents">
                  <dt className="font-semibold text-pet-strong">Good for</dt>
                  <dd className="min-w-0 break-words">
                    {product.tags.map((t) => t.name).join(', ')}
                  </dd>
                </div>
              )}
            </dl>
          }
        />
        <KitsBlock kits={product.kits} currency={product.price.currency} />
        <BoughtTogether productSlug={product.slug} productName={product.name} variant={variant} />
        <RelatedStrip productSlug={product.slug} />
        <RecentlyViewed excludeId={product.id} />
      </Container>
    </div>
  );
}

function ProductSkeleton() {
  return (
    <Container className="py-6" data-testid={TEST_IDS.pageProduct} aria-busy="true">
      <p className="sr-only" role="status">
        Loading product
      </p>
      <Skeleton className="h-5 w-64" />
      <div className="mt-6 grid grid-cols-1 gap-8 md:grid-cols-2 lg:gap-12">
        <Skeleton className="aspect-square w-full rounded-card" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    </Container>
  );
}
