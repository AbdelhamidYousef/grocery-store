import type { GalleryPhoto, GalleryProduct } from '@store/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Price } from '../../components/ui/Price';
import { TEST_IDS } from '../../lib/test-ids';
import { track } from '../../lib/track';
import { useAddToCartAction } from '../cart/queries';
import { useGallery } from '../reviews/queries';

// #RealPawsomePets: customers' photos in a masonry grid (CSS columns: each tile keeps its own
// height, so portrait and landscape photos pack without cropping). A click opens a dialog with the
// photo, the caption and the products in it, each with its own "Add to cart", so the shopper buys
// without leaving the page. Nothing at all renders while loading, on an error, or when there are
// no published photos: an empty gallery must not leave a heading with nothing under it.
export function ShoppableGallery({
  productId,
  heading = '#RealPawsomePets',
  intro = 'Real customers, real pets. Tap a photo to shop what they use.',
}: {
  /** Only photos that feature this product (the product page); everything otherwise. */
  productId?: string;
  heading?: string;
  intro?: string;
}) {
  const { data } = useGallery(productId);
  const [openId, setOpenId] = useState<string | null>(null);
  if (!data || data.length === 0) return null;
  const open = data.find((p) => p.id === openId) ?? null;

  return (
    <section aria-labelledby={`gallery-heading-${productId ?? 'home'}`} className="mt-10">
      <h2
        id={`gallery-heading-${productId ?? 'home'}`}
        className="font-display text-2xl font-bold sm:text-3xl"
      >
        {heading}
      </h2>
      <p className="mt-1 text-muted">{intro}</p>
      <ul
        data-testid={TEST_IDS.galleryGrid}
        className="mt-4 columns-2 gap-3 md:columns-3 lg:columns-4"
      >
        {data.map((photo) => (
          <li key={photo.id} className="mb-3 break-inside-avoid">
            <button
              type="button"
              data-testid={TEST_IDS.galleryItem}
              aria-label={`Open photo: ${photo.caption || photo.petName || 'customer photo'}`}
              onClick={() => {
                track({ name: 'gallery_open', photoId: photo.id });
                setOpenId(photo.id);
              }}
              className="group relative block w-full overflow-hidden rounded-card border border-line bg-surface shadow-card"
            >
              <img
                src={photo.path}
                alt=""
                loading="lazy"
                className="block w-full transition-transform group-hover:scale-[1.02]"
              />
              {photo.petName && (
                <span className="absolute bottom-2 left-2 rounded-full bg-surface/90 px-2 py-0.5 text-xs font-semibold">
                  {photo.petName}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      <Dialog
        open={open !== null}
        onClose={() => setOpenId(null)}
        title={open?.caption || open?.petName || 'Customer photo'}
      >
        {open && <GalleryModalBody photo={open} />}
      </Dialog>
    </section>
  );
}

function GalleryModalBody({ photo }: { photo: GalleryPhoto }) {
  return (
    <div data-testid={TEST_IDS.galleryModal} className="grid gap-4 p-4 md:grid-cols-2">
      <img
        src={photo.path}
        alt={photo.caption || `${photo.petName || 'A customer'}'s pet`}
        className="max-h-[70vh] w-full rounded-card object-contain"
      />
      <div className="flex min-w-0 flex-col gap-3">
        {photo.caption && <p className="break-words text-lg">{photo.caption}</p>}
        {photo.petName && <p className="text-sm text-muted">Pictured: {photo.petName}</p>}
        {photo.products.length > 0 ? (
          <>
            <h3 className="font-display text-lg font-bold">Shop this photo</h3>
            <ul className="flex flex-col gap-3">
              {photo.products.map((p) => (
                <GalleryProductRow key={p.id} product={p} />
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-muted">No products are linked to this photo.</p>
        )}
      </div>
    </div>
  );
}

function GalleryProductRow({ product }: { product: GalleryProduct }) {
  const cart = useAddToCartAction(product);
  return (
    <li
      data-testid="gallery-product"
      className="flex items-center gap-3 rounded-card border border-line p-2"
    >
      {product.imageUrl && (
        <img
          src={product.imageUrl}
          alt=""
          className="h-16 w-16 shrink-0 rounded-control object-cover"
        />
      )}
      <div className="min-w-0 flex-1">
        <Link to={`/products/${product.slug}`} className="break-words font-semibold underline">
          {product.name}
        </Link>
        <Price
          cents={product.priceCents}
          currency={product.currency}
          className="block text-pet-strong"
        />
      </div>
      {product.variantId ? (
        <Button
          size="sm"
          loading={cart.pending}
          aria-label={`Add ${product.name} to cart`}
          onClick={() =>
            cart.add(
              { id: product.variantId!, sku: product.variantId!, priceCents: product.priceCents },
              1,
            )
          }
        >
          Add to cart
        </Button>
      ) : (
        <span className="text-sm font-semibold text-danger">Sold out</span>
      )}
    </li>
  );
}
