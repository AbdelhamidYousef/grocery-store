import type { ProductCard as ProductCardData } from '@store/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Badge } from '../../components/ui/Badge';
import { Price } from '../../components/ui/Price';
import { ProductBadges } from '../../components/ui/ProductBadges';
import { UnitPrice } from '../../components/ui/UnitPrice';
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

// Past this many colours the rest collapse into "+N colours".
const MAX_SWATCHES = 4;

const titleCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

// The image and text are one link (a big tap target, one tab stop). The colour dots are NOT inside
// that link, because a button inside a link is invalid and unreachable by keyboard; they sit below
// it in the same card. Hovering or focusing a dot previews that colour's photo, and a click (a
// tap, on touch) keeps it.
export function ProductCard({
  product,
  priority = false,
  sizes = '(min-width: 1280px) 25vw, (min-width: 640px) 33vw, 50vw',
}: ProductCardProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const active = preview ?? picked;
  const swatch = product.swatches.find((s) => s.color === active);
  const image = swatch?.image ?? product.image;
  const shown = product.swatches.slice(0, MAX_SWATCHES);
  const more = product.swatches.length - shown.length;

  return (
    <li data-pet={accentForPetAttribute(product.attributes.pet)} className="min-w-0">
      <div className="group flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card transition-transform hover:-translate-y-0.5">
        <Link
          to={`/products/${product.slug}`}
          data-testid={TEST_IDS.productCard}
          className="flex flex-1 flex-col"
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
            <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
              {!product.inStock && (
                <Badge
                  tone="neutral"
                  data-testid={TEST_IDS.soldOutBadge}
                  className="border-ink bg-surface text-ink"
                >
                  Sold out
                </Badge>
              )}
              <ProductBadges badges={product.badges} />
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-1 p-3 sm:p-4">
            {/* Two lines at most: the clamp keeps every card in a row the same height even for
                the longest product name; the full name is still in the accessible name. */}
            <h3
              data-testid={TEST_IDS.productCardName}
              className="line-clamp-2 break-words font-display text-base font-semibold leading-snug"
            >
              {product.name}
            </h3>
            <div className="mt-auto flex flex-col">
              <Price
                cents={product.price.minCents}
                maxCents={product.price.maxCents}
                currency={product.price.currency}
                className="text-pet-strong"
              />
              <UnitPrice unitPrice={product.unitPrice} currency={product.price.currency} />
            </div>
          </div>
        </Link>
        {product.swatches.length > 0 && (
          <div
            role="group"
            aria-label={`Colours of ${product.name}`}
            className="flex flex-wrap items-center gap-1 px-3 pb-3 sm:px-4 sm:pb-4"
            onMouseLeave={() => setPreview(null)}
          >
            {shown.map((s) => (
              <button
                key={s.color}
                type="button"
                data-testid={TEST_IDS.swatch}
                aria-label={titleCase(s.color)}
                aria-pressed={active === s.color}
                onMouseEnter={() => setPreview(s.color)}
                onFocus={() => setPreview(s.color)}
                onBlur={() => setPreview(null)}
                onClick={() => setPicked((current) => (current === s.color ? null : s.color))}
                className="flex size-7 items-center justify-center rounded-full"
              >
                <span
                  aria-hidden="true"
                  style={{ backgroundColor: s.hex }}
                  className={`size-5 rounded-full border border-ink/30 ${
                    active === s.color ? 'ring-2 ring-pet-strong ring-offset-1' : ''
                  }`}
                />
              </button>
            ))}
            {more > 0 && (
              <span data-testid={TEST_IDS.swatchMore} className="text-xs font-semibold text-muted">
                +{more} {more === 1 ? 'colour' : 'colours'}
              </span>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
