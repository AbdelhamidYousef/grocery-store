import type { Config } from 'tailwindcss';

// Theme tokens (one accent colour per pet category) arrive in phase 4.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
