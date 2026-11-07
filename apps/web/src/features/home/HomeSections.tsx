import type { Testimonial } from '@store/shared';
import { Link } from 'react-router-dom';

import { Skeleton } from '../../components/ui/Skeleton';
import { GuideCard } from '../guides/GuideCard';
import { useGuides } from '../guides/queries';

import { HERO_BOX } from './HeroCarousel';
import { useTestimonials } from './queries';

export function HeroSkeleton() {
  return (
    <div aria-hidden="true" data-testid="hero-skeleton" className={`bg-primary-soft ${HERO_BOX}`} />
  );
}

// Static promises the shop already keeps (free delivery from the seeded standard method, the
// happy-tail promise); each is a short line so the bar stays one tidy row.
const TRUST = [
  { title: 'Free delivery', text: 'On orders over 49 euros' },
  { title: 'Happy-tail promise', text: 'Not a hit? We make it right' },
  { title: 'Pet-safe picks', text: 'Honest materials and ingredients' },
  { title: 'Secure checkout', text: 'Pay by card, safely' },
] as const;

export function TrustBar() {
  return (
    <section
      aria-label="Why shop with us"
      data-testid="trust-bar"
      className="border-b border-line bg-surface"
    >
      <ul className="mx-auto grid max-w-7xl grid-cols-2 gap-x-4 gap-y-3 px-4 py-4 sm:px-6 lg:grid-cols-4 lg:px-8">
        {TRUST.map((t) => (
          <li key={t.title} className="min-w-0">
            <p className="font-display font-bold">{t.title}</p>
            <p className="text-sm text-muted">{t.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PromoTile({
  tile,
}: {
  tile: { text: string | null; linkLabel: string | null; linkHref: string | null };
}) {
  const { text, linkLabel, linkHref } = tile;
  if (!text) return null;
  return (
    <section
      aria-label="Offer"
      data-testid="promo-tile"
      className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-primary-soft p-5"
    >
      <p className="max-w-prose font-display text-lg font-semibold text-ink">{text}</p>
      {linkLabel && linkHref && (
        <Link
          to={linkHref}
          className="min-h-11 rounded-control font-semibold text-primary-strong underline underline-offset-2"
        >
          {linkLabel}
        </Link>
      )}
    </section>
  );
}

const GUIDES_SHOWN = 3;

export function GuidesTeaser() {
  const { data, isPending, isError } = useGuides({ limit: GUIDES_SHOWN });
  if (isError || (data && data.data.length === 0)) return null;
  return (
    <section aria-labelledby="home-guides-heading" data-testid="guides-teaser">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
        <h2 id="home-guides-heading" className="text-2xl font-bold sm:text-3xl">
          Pet care guides
        </h2>
        <Link
          to="/guides"
          className="min-h-11 rounded-control font-semibold text-primary-strong underline underline-offset-2"
        >
          All guides
        </Link>
      </div>
      {isPending ? (
        <div aria-hidden="true" className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {Array.from({ length: GUIDES_SHOWN }, (_, i) => (
            <Skeleton key={i} className="h-72 rounded-card" />
          ))}
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {data.data.slice(0, GUIDES_SHOWN).map((g) => (
            <GuideCard key={g.slug} guide={g} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <span aria-hidden="true" className="text-lg tracking-wider text-primary-strong">
      {'★'.repeat(rating)}
      {'☆'.repeat(5 - rating)}
    </span>
  );
}

function TestimonialCard({ t }: { t: Testimonial }) {
  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-card border border-line bg-surface p-5">
      <Stars rating={t.rating} />
      <span className="sr-only">{t.rating} out of 5 stars</span>
      <blockquote className="text-ink">&ldquo;{t.quote}&rdquo;</blockquote>
      <p className="mt-auto text-sm text-muted">
        <span className="font-semibold text-ink">{t.name}</span>, with {t.pet}
      </p>
    </li>
  );
}

export function Testimonials() {
  const { data, isPending, isError } = useTestimonials();
  if (isError || (data && data.data.length === 0)) return null;
  return (
    <section aria-labelledby="home-testimonials-heading" data-testid="testimonials">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <h2 id="home-testimonials-heading" className="text-2xl font-bold sm:text-3xl">
          Happy tails
        </h2>
        <p className="min-h-6 text-muted" data-testid="rating-summary">
          {data?.meta.average != null &&
            `${data.meta.average.toFixed(1)} out of 5, from ${data.meta.count} happy customers`}
        </p>
      </div>
      {isPending ? (
        <div aria-hidden="true" className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 rounded-card" />
          ))}
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {data.data.slice(0, 3).map((t) => (
            <TestimonialCard key={t.id} t={t} />
          ))}
        </ul>
      )}
    </section>
  );
}
