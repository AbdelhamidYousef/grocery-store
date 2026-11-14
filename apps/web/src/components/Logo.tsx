import { cn } from '../lib/cn';

// The Grocery mark: a rounded shopping bag with a leaf on it, then the word in the display font.
// Hand-drawn inline SVG, not an image: crisp at any size, coloured by the design tokens, no request.
// `tone="light"` is for the dark footer (a brighter green so the bag does not sink into the ink).
// The same shapes with fixed colours live in public/favicon.svg; change both together.
export function LogoMark({
  tone = 'default',
  className,
}: {
  tone?: 'default' | 'light';
  className?: string;
}) {
  const bag = tone === 'light' ? 'var(--color-primary-bright)' : 'var(--color-primary)';
  const handle = tone === 'light' ? 'var(--color-primary-bright)' : 'var(--color-primary-strong)';
  return (
    <svg
      viewBox="0 0 48 48"
      width="36"
      height="36"
      aria-hidden="true"
      focusable="false"
      data-testid="logo-mark"
      className={cn('shrink-0', className)}
    >
      <path
        d="M17 17v-3a7 7 0 0 1 14 0v3"
        fill="none"
        stroke={handle}
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <rect x="7" y="16" width="34" height="28" rx="9" fill={bag} />
      <path d="M24 22c7 3 9 10 0 16-9-6-7-13 0-16z" fill="var(--color-accent)" />
      <path
        d="M24 26v10"
        fill="none"
        stroke={tone === 'light' ? 'var(--color-ink)' : 'var(--color-primary-strong)'}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logo({
  tone = 'default',
  className,
}: {
  tone?: 'default' | 'light';
  className?: string;
}) {
  return (
    <span className={cn('flex items-center gap-2 font-display text-2xl font-bold', className)}>
      <LogoMark tone={tone} />
      <span>Grocery</span>
    </span>
  );
}
