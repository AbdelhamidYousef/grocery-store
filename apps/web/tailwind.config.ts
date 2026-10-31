import type { Config } from 'tailwindcss';

// Tailwind only names the tokens; the values live in src/styles/tokens.css as CSS variables so
// `data-pet="cat"` on any wrapper re-themes every `pet-*` utility beneath it with no JS.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: 'var(--color-ink)',
        muted: 'var(--color-muted)',
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        line: 'var(--color-border)',
        primary: {
          DEFAULT: 'var(--color-primary)',
          hover: 'var(--color-primary-hover)',
          strong: 'var(--color-primary-strong)',
          bright: 'var(--color-primary-bright)',
          soft: 'var(--color-primary-soft)',
        },
        success: { DEFAULT: 'var(--color-success)', soft: 'var(--color-success-soft)' },
        danger: { DEFAULT: 'var(--color-danger)', soft: 'var(--color-danger-soft)' },
        pet: {
          accent: 'var(--pet-accent)',
          soft: 'var(--pet-soft)',
          strong: 'var(--pet-strong)',
        },
      },
      fontFamily: {
        display: 'var(--font-display)',
        sans: 'var(--font-body)',
      },
      borderRadius: {
        control: 'var(--radius-control)',
        card: 'var(--radius-card)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
      },
    },
  },
  plugins: [],
} satisfies Config;
