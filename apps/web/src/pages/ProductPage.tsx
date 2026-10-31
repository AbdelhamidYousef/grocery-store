import type { ProductDetail } from '@store/shared';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { ApiError } from '../api/client';
import { Breadcrumbs, type Crumb } from '../components/layout/Breadcrumbs';
import { Container } from '../components/layout/Container';
import { Seo } from '../components/Seo';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Price } from '../components/ui/Price';
import { Skeleton } from '../components/ui/Skeleton';
import { formatFacetValue } from '../features/catalog/filters';
import { Gallery } from '../features/catalog/Gallery';
import { useProduct } from '../features/catalog/queries';
import { defaultVariant } from '../features/catalog/resolve-variant';
import { accentForPetAttribute, petBySlug } from '../lib/pets';
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

  if (error instanceof ApiError && error.status === 404) return <NotFoundPage />;
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
  const variant = defaultVariant(product.variants);
  const [imageId, setImageId] = useState(product.images[0]?.id);

  useEffect(() => {
    track({
      name: 'view_item',
      item: { id: product.id, name: product.name, price: variant?.priceCents },
    });
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
      />
      <Container className="py-6">
        <Breadcrumbs items={crumbs} />
        <div className="mt-6 grid gap-8 md:grid-cols-2 lg:gap-12">
          <Gallery
            images={product.images}
            selectedId={imageId}
            onSelect={setImageId}
            soldOut={!product.inStock}
          />

          <div className="flex min-w-0 flex-col gap-5">
            <div>
              <h1 className="break-words font-display text-3xl font-bold sm:text-4xl">
                {product.name}
              </h1>
              {!product.inStock && (
                <Badge tone="neutral" className="mt-2 border-ink bg-surface text-ink">
                  Sold out
                </Badge>
              )}
            </div>

            {variant ? (
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

            <p className="max-w-prose text-lg">{product.description}</p>

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
            </dl>
          </div>
        </div>
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
      <div className="mt-6 grid gap-8 md:grid-cols-2 lg:gap-12">
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
