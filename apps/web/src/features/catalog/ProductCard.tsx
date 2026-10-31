import type { ProductCard as ProductCardData } from '@store/shared';
import { Link } from 'react-router-dom';

import { Badge } from '../../components/ui/Badge';
import { Price } from '../../components/ui/Price';
import { productSrcSet } from '../../lib/images';
import { accentForPetAttribute } from '../../lib/pets';
import { TEST_IDS } from '../../lib/test-ids';

interface ProductCardProps {
  product: ProductCardData;
  /** First-row cards load eagerly (they are above the fold); the rest are lazy. */
  priority?: boolean;
  /** Width the card occupies, for the browser's srcset choice. */
  sizes?: string;
}

// The whole card is one link: a big, single tap target, and one tab stop per product instead of
// three (image, name, price).
export function ProductCard({
  product,
  priority = false,
  sizes = '(min-width: 1280px) 25vw, (min-width: 640px) 33vw, 50vw',
}: ProductCardProps) {
  const { image } = product;
  return (
    <li data-pet={accentForPetAttribute(product.attributes.pet)} className="min-w-0">
      <Link
        to={`/products/${product.slug}`}
        data-testid={TEST_IDS.productCard}
        className="group flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card transition-transform hover:-translate-y-0.5"
      >
        <div className="relative aspect-square bg-pet-soft">
          {image ? (
            <img
              src={image.url}
              srcSet={productSrcSet(image.url)}
              sizes={sizes}
              width={image.width}
              height={image.height}
              alt={image.alt}
              loading={priority ? 'eager' : 'lazy'}
              decoding="async"
              className={`h-full w-full object-cover ${product.inStock ? '' : 'opacity-60'}`}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-pet-strong" aria-hidden>
              No image
            </div>
          )}
          {!product.inStock && (
            <Badge
              tone="neutral"
              data-testid={TEST_IDS.soldOutBadge}
              className="absolute left-2 top-2 border-ink bg-surface text-ink"
            >
              Sold out
            </Badge>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1 p-3 sm:p-4">
          {/* Two lines at most: the clamp keeps every card in a row the same height even for the
              longest product name; the full name is still in the accessible name. */}
          <h3
            data-testid={TEST_IDS.productCardName}
            className="line-clamp-2 break-words font-display text-base font-semibold leading-snug"
          >
            {product.name}
          </h3>
          <Price
            cents={product.price.minCents}
            maxCents={product.price.maxCents}
            currency={product.price.currency}
            className="mt-auto text-pet-strong"
          />
        </div>
      </Link>
    </li>
  );
}
