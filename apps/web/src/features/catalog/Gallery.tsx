import type { ProductImage } from '@store/shared';

import { useT } from '../../i18n';
import { productSrcSet } from '../../lib/images';
import { TEST_IDS } from '../../lib/test-ids';

interface GalleryProps {
  images: readonly ProductImage[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  /** Dim the main image for a sold-out product. */
  soldOut?: boolean;
}

// The thumbnails are a native radio group (visually hidden <input type="radio"> inside a label):
// the browser then gives group semantics, one tab stop for the whole row, and Left/Right/Up/Down
// to move and select, with no hand-written key handling to get wrong. Choosing a thumbnail swaps
// the main image, which is exactly what "selecting a radio" means.
export function Gallery({ images, selectedId, onSelect, soldOut = false }: GalleryProps) {
  const { t } = useT();
  const selected = images.find((i) => i.id === selectedId) ?? images[0];

  if (!selected) {
    return (
      <div
        className="flex aspect-square items-center justify-center rounded-card bg-pet-soft text-pet-strong"
        data-testid={TEST_IDS.gallery}
      >
        {t('catalog.gallery.noImage')}
      </div>
    );
  }

  return (
    <div data-testid={TEST_IDS.gallery} className="flex flex-col gap-3">
      {/* Fixed square box + width/height: swapping images never moves the page. The main image
          is the likely largest-contentful-paint element, so it loads eagerly with high priority. */}
      <div className="aspect-square overflow-hidden rounded-card bg-pet-soft shadow-card">
        <img
          key={selected.id}
          data-testid={TEST_IDS.galleryMain}
          src={selected.url}
          srcSet={productSrcSet(selected.url)}
          sizes="(min-width: 768px) 50vw, 100vw"
          width={selected.width}
          height={selected.height}
          alt={selected.alt}
          loading="eager"
          // React 18 does not know `fetchPriority` (React 19 does) and warns; the lowercase
          // attribute is what the browser reads, so it is passed through a spread.
          {...{ fetchpriority: 'high' }}
          decoding="async"
          className={`h-full w-full object-cover ${soldOut ? 'opacity-70' : ''}`}
        />
      </div>

      {images.length > 1 && (
        <fieldset>
          <legend className="sr-only">{t('catalog.gallery.images')}</legend>
          <div className="flex flex-wrap gap-2">
            {images.map((image, index) => (
              <label key={image.id} className="cursor-pointer">
                <input
                  type="radio"
                  name="gallery-image"
                  className="peer sr-only"
                  data-testid={TEST_IDS.galleryThumb}
                  checked={image.id === selected.id}
                  onChange={() => onSelect(image.id)}
                />
                <span className="sr-only">
                  {t('catalog.gallery.imageOf', {
                    n: index + 1,
                    total: images.length,
                    alt: image.alt,
                  })}
                </span>
                <img
                  src={image.url.replace(/\.webp$/, '-600.webp')}
                  width={80}
                  height={80}
                  alt=""
                  loading="lazy"
                  className="h-16 w-16 rounded-control border-2 border-transparent object-cover peer-checked:border-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink sm:h-20 sm:w-20"
                />
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}
