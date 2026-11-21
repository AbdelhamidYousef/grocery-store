import type { DepartmentIcon } from '@store/shared';

// The line icon of each department, as SVG path data on a 24 x 24 grid (stroke 2, round caps).
// One source for two users: the `DepartmentGlyph` component (components/icons.tsx) and the
// placeholder pictures in public/products/placeholders, which `tools/make-placeholders.ts`
// writes from these same paths. Plain data, no React, so a node script can import it.
export const DEPARTMENT_ICON_PATHS: Record<DepartmentIcon, readonly string[]> = {
  apple: [
    'M12 7.500c-2-1.500-6-1-6.500 3.500C5 15 7.500 20 10 20c.8 0 1.200-.5 2-.5s1.200.5 2 .5c2.500 0 5-5 4.500-9C18 6.500 14 6 12 7.500z',
    'M12 7.500c0-2 1-3.500 2.500-4.500',
  ],
  bread: [
    'M5 11c0-3 3-5 7-5s7 2 7 5c0 1-.5 1.500-1 1.700V18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-5.300c-.5-.2-1-.7-1-1.700z',
    'M9.500 10l1 2.500M13 10l1 2.500',
  ],
  milk: [
    'M8.500 3h7l1.500 4v13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V7l1.500-4z',
    'M7 8.500h10',
    'M12 12.500c-1.500 1.800-2 2.500-2 3.300a2 2 0 0 0 4 0c0-.8-.5-1.500-2-3.300z',
  ],
  fish: [
    'M3 12c2.500-4.500 6.500-6 10-6 3 0 5.500 2.600 6.500 6-1 3.400-3.500 6-6.500 6-3.500 0-7.500-1.500-10-6z',
    'M19.500 12L22 8.500v7z',
    'M12.500 8.500c1 2.200 1 4.800 0 7',
  ],
  jar: [
    'M8 3.500h8v2.500H8z',
    'M7 6h10l1 3v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9l1-3z',
    'M6.500 11h11M6.500 16h11',
  ],
  snowflake: [
    'M12 3v18M4.500 7.500l15 9M19.500 7.500l-15 9',
    'M9.500 4.500L12 7l2.500-2.500M9.500 19.500L12 17l2.500 2.500',
  ],
  bottle: [
    'M10 3h4v3l1.500 2.500V20a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V8.500L10 6V3z',
    'M8.500 12.500h7M8.500 17h7',
  ],
  candy: [
    'M12 7.500a4.500 4.500 0 1 0 0 9 4.500 4.500 0 0 0 0-9z',
    'M7.500 12L3 9v6l4.500-3zM16.500 12L21 9v6l-4.500-3z',
  ],
  spray: [
    'M8.500 11h6v9a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-9z',
    'M10 11V8h4.500l2.500-1.500M17 10l2.500.5M17.500 4l1.500-1',
  ],
  drop: [
    'M12 3c3.500 4 6 7 6 10.500a6 6 0 0 1-12 0C6 10 8.500 7 12 3z',
    'M9.500 14a2.500 2.500 0 0 0 2 2.500',
  ],
};
