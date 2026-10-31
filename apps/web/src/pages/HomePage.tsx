import { useEffect } from 'react';
import { Link } from 'react-router-dom';

import { Container } from '../components/layout/Container';
import { Seo } from '../components/Seo';
import { PetTiles } from '../features/catalog/PetTiles';
import { ProductCard } from '../features/catalog/ProductCard';
import { useProducts } from '../features/catalog/queries';
import { image600 } from '../lib/images';
import { TEST_IDS } from '../lib/test-ids';
import { track } from '../lib/track';

const NEW_ARRIVALS = { sort: 'newest', limit: 8 } as const;

const WHY = [
  {
    title: 'Picked by pet people',
    text: 'Every toy, bed and treat is chosen for how it holds up to real chewing, scratching and zooming.',
  },
  {
    title: 'Kind to the little ones',
    text: 'Safe materials, honest ingredient lists and no nasties, so you can relax while they play.',
  },
  {
    title: 'Happy-tail promise',
    text: 'Not a hit with your pet? Tell us and we will make it right. Their joy is our whole job.',
  },
] as const;

export default function HomePage() {
  const { data, isPending, isError } = useProducts(NEW_ARRIVALS);

  useEffect(() => {
    track({ name: 'view_home' });
  }, []);

  const hero = data?.data.slice(0, 3) ?? [];

  return (
    <div data-testid={TEST_IDS.pageHome}>
      <Seo
        title="Pawsome"
        description="Colourful, tough and tail-wag-approved supplies for dogs, cats, birds, fish and small pets."
      />

      <section className="bg-primary-soft">
        <Container className="grid items-center gap-8 py-10 md:grid-cols-2 md:py-16">
          <div className="flex flex-col items-start gap-4">
            <h1 className="font-display text-4xl font-bold leading-tight text-ink sm:text-5xl">
              Happy tails start <span className="text-primary-strong">here</span>
            </h1>
            <p className="max-w-prose text-lg text-ink">
              Bright, sturdy supplies for dogs, cats, birds, fish and small pets, made for play,
              naps and snack time.
            </p>
            <Link
              to="/c/dogs"
              className="inline-flex min-h-12 items-center rounded-control bg-primary px-7 font-display text-lg font-semibold text-surface hover:bg-primary-hover"
            >
              Start shopping
            </Link>
          </div>
          {/* Decorative collage of real catalogue photos; the same pictures are links below. */}
          <div className="grid grid-cols-3 gap-3" aria-hidden="true">
            {hero.map((p, i) =>
              p.image ? (
                <img
                  key={p.id}
                  src={p.image.url}
                  srcSet={`${image600(p.image.url)} 600w`}
                  sizes="(min-width: 768px) 16vw, 30vw"
                  width={p.image.width}
                  height={p.image.height}
                  alt=""
                  loading="eager"
                  className={`aspect-square w-full rounded-card object-cover shadow-card ${i === 1 ? 'mt-6' : ''}`}
                />
              ) : null,
            )}
          </div>
        </Container>
      </section>

      <Container className="mt-12">
        <h2 className="mb-5 text-2xl font-bold sm:text-3xl">Shop by pet</h2>
        <PetTiles />
      </Container>

      <Container className="mt-12">
        <h2 className="mb-5 text-2xl font-bold sm:text-3xl">New arrivals</h2>
        {isError ? (
          <p role="alert" className="rounded-card bg-danger-soft p-4 text-danger">
            We could not load new arrivals just now. Please try again in a moment.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
            {isPending
              ? Array.from({ length: 8 }, (_, i) => (
                  <li
                    key={i}
                    className="aspect-[3/4] animate-pulse rounded-card bg-line"
                    aria-hidden
                  />
                ))
              : data.data.map((p) => <ProductCard key={p.id} product={p} />)}
          </ul>
        )}
      </Container>

      <Container className="mt-12">
        <h2 className="mb-5 text-2xl font-bold sm:text-3xl">Why Pawsome</h2>
        <ul className="grid gap-4 md:grid-cols-3">
          {WHY.map((item) => (
            <li key={item.title} className="rounded-card border border-line bg-surface p-6">
              <h3 className="text-xl font-bold">{item.title}</h3>
              <p className="mt-2 text-muted">{item.text}</p>
            </li>
          ))}
        </ul>
      </Container>
    </div>
  );
}
