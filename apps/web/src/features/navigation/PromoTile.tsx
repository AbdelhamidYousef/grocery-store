import type { NavPromo } from '@store/shared';
import { Link } from 'react-router-dom';

// The featured tile of a menu panel. The picture has fixed dimensions (and lazy loading) so a
// panel opening never shifts the page; the whole tile is one link.
export function PromoTile({ promo, onNavigate }: { promo: NavPromo; onNavigate?: () => void }) {
  const external = promo.link.startsWith('https://');
  const body = (
    <>
      <img
        src={promo.imageUrl}
        alt={promo.imageAlt}
        width={320}
        height={200}
        loading="lazy"
        className="aspect-[8/5] w-full rounded-control bg-pet-soft object-cover"
      />
      <span className="mt-2 block break-words font-display text-lg font-bold">{promo.title}</span>
      {promo.subtitle && (
        <span className="block break-words text-sm text-muted">{promo.subtitle}</span>
      )}
    </>
  );
  const className = 'block min-h-11 rounded-card border-2 border-line p-2 hover:bg-pet-soft';
  return external ? (
    <a
      href={promo.link}
      rel="noopener noreferrer"
      className={className}
      data-testid="menu-promo"
      onClick={onNavigate}
    >
      {body}
    </a>
  ) : (
    <Link to={promo.link} className={className} data-testid="menu-promo" onClick={onNavigate}>
      {body}
    </Link>
  );
}
