import type { HeroSlide } from '@store/shared';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { cn } from '../../lib/cn';
import { image600 } from '../../lib/images';

const ROTATE_MS = 6000;

// The box never changes size: its height is fixed per breakpoint (the skeleton uses the same
// classes), and the copy is clamped, so neither loading nor changing slides moves the page.
export const HERO_BOX = 'h-[34rem] sm:h-[30rem] md:h-[26rem]';

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

// "Starts paused" for people who asked their system for less motion; they can still press play.
export function HeroCarousel({ slides }: { slides: readonly HeroSlide[] }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const count = slides.length;

  const go = useCallback((to: number) => setIndex(((to % count) + count) % count), [count]);

  const rotating = playing && !hovered && !focused && count > 1;
  useEffect(() => {
    if (!rotating) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), ROTATE_MS);
    return () => clearInterval(timer);
  }, [rotating, count]);

  const btn =
    'inline-flex h-11 min-w-11 items-center justify-center rounded-full bg-surface px-3 font-bold text-ink shadow-card hover:bg-pet-soft';

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured offers"
      data-testid="hero-carousel"
      data-playing={rotating}
      className={cn('relative overflow-hidden bg-primary-soft', HERO_BOX)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      }}
    >
      {/* Announce slide changes only when the user is driving; never while it rotates by itself. */}
      <div aria-live={rotating ? 'off' : 'polite'} className="h-full">
        {slides.map((slide, i) => (
          <div
            key={slide.title}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${count}`}
            hidden={i !== index}
            data-testid="hero-slide"
            className="mx-auto grid h-full max-w-7xl [&[hidden]]:hidden grid-rows-[1fr_auto] gap-4 px-4 pb-20 pt-6 sm:px-6 md:grid-cols-2 md:grid-rows-1 md:items-center md:gap-8 md:pb-16 lg:px-8"
          >
            <div className="order-2 flex min-h-0 flex-col items-start gap-3 md:order-1">
              <h2 className="line-clamp-2 font-display text-3xl font-bold leading-tight text-ink sm:text-4xl md:text-5xl">
                {slide.title}
              </h2>
              <p className="line-clamp-3 max-w-prose text-lg text-ink">{slide.text}</p>
              {slide.ctaHref.startsWith('/') ? (
                <Link to={slide.ctaHref} className={ctaClass}>
                  {slide.ctaLabel}
                </Link>
              ) : (
                <a href={slide.ctaHref} className={ctaClass} rel="noopener">
                  {slide.ctaLabel}
                </a>
              )}
            </div>
            <div className="order-1 min-h-0 md:order-2">
              {slide.imageUrl && (
                <img
                  src={slide.imageUrl}
                  srcSet={
                    slide.imageUrl.startsWith('/products/')
                      ? `${image600(slide.imageUrl)} 600w, ${slide.imageUrl} 1200w`
                      : undefined
                  }
                  sizes="(min-width: 768px) 40vw, 90vw"
                  alt=""
                  loading={i === 0 ? 'eager' : 'lazy'}
                  className="mx-auto h-full max-h-full w-full rounded-card object-cover shadow-card md:max-h-72"
                />
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="absolute inset-x-0 bottom-3 flex flex-wrap items-center justify-center gap-2 px-4">
        <button type="button" className={btn} onClick={() => go(index - 1)} data-testid="hero-prev">
          <span aria-hidden="true">&lsaquo;</span>
          <span className="sr-only">Previous slide</span>
        </button>
        <button
          type="button"
          className={btn}
          onClick={() => setPlaying((p) => !p)}
          aria-pressed={!playing}
          data-testid="hero-toggle"
        >
          {playing ? 'Pause' : 'Play'}
          <span className="sr-only"> slide show</span>
        </button>
        <button type="button" className={btn} onClick={() => go(index + 1)} data-testid="hero-next">
          <span aria-hidden="true">&rsaquo;</span>
          <span className="sr-only">Next slide</span>
        </button>
        <ul className="flex items-center" data-testid="hero-dots">
          {slides.map((slide, i) => (
            <li key={slide.title}>
              <button
                type="button"
                onClick={() => go(i)}
                aria-label={`Go to slide ${i + 1}`}
                aria-current={i === index ? 'true' : undefined}
                className="group inline-flex h-11 w-9 items-center justify-center"
              >
                <span
                  className={cn(
                    'block h-3 rounded-full border-2 border-ink transition-all',
                    i === index ? 'w-6 bg-ink' : 'w-3 bg-surface group-hover:bg-pet-soft',
                  )}
                />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const ctaClass =
  'inline-flex min-h-12 items-center rounded-control bg-primary px-7 font-display text-lg font-semibold text-surface hover:bg-primary-hover';
