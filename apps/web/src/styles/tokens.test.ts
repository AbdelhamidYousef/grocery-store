// @vitest-environment node
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

// Read from disk, not `?raw`: Vitest runs CSS imports through its CSS pipeline and returns ''.
const tokensCss = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

// WCAG 2.x relative luminance and contrast ratio, straight from the spec.
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

// Reads the variables of one block (":root" or "[data-pet='dog']") out of tokens.css, so the
// test checks the values that actually ship rather than a copy that could drift.
function readBlock(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(tokensCss)?.[1] ?? '';
  const vars: Record<string, string> = {};
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) vars[m[1]!] = m[2]!;
  return vars;
}

const root = readBlock(':root');
const pets = ['dog', 'cat', 'bird', 'fish', 'small-pet', 'reptile'] as const;
const AA_TEXT = 4.5;

describe('design tokens meet WCAG AA for text', () => {
  it('finds every token it relies on', () => {
    expect(Object.keys(root).length).toBeGreaterThan(8);
    for (const pet of pets) {
      expect(Object.keys(readBlock(`[data-pet='${pet}']`)).sort()).toEqual([
        '--pet-accent',
        '--pet-soft',
        '--pet-strong',
      ]);
    }
  });

  // [foreground, background] pairs the UI really uses for text.
  const base: [string, string][] = [
    ['--color-ink', '--color-bg'],
    ['--color-ink', '--color-surface'],
    ['--color-muted', '--color-bg'],
    ['--color-muted', '--color-surface'],
    ['--color-surface', '--color-primary'], // button label
    ['--color-surface', '--color-primary-hover'],
    ['--color-ink', '--color-primary-bright'], // big coral fills
    ['--color-ink', '--color-primary-soft'],
    ['--color-primary-strong', '--color-bg'], // links
    ['--color-primary-strong', '--color-surface'],
    ['--color-primary-strong', '--color-primary-soft'],
    ['--color-success', '--color-success-soft'],
    ['--color-danger', '--color-danger-soft'],
    ['--color-danger', '--color-surface'],
  ];

  it.each(base)('%s on %s', (fg, bg) => {
    expect(contrast(root[fg]!, root[bg]!)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  describe.each(pets)('pet theme %s', (pet) => {
    const vars = readBlock(`[data-pet='${pet}']`);
    const ink = root['--color-ink']!;
    const pairs: [string, string, string][] = [
      ['ink on accent', ink, vars['--pet-accent']!],
      ['ink on soft', ink, vars['--pet-soft']!],
      ['strong on soft', vars['--pet-strong']!, vars['--pet-soft']!],
      ['strong on surface', vars['--pet-strong']!, root['--color-surface']!],
      ['strong on bg', vars['--pet-strong']!, root['--color-bg']!],
    ];
    it.each(pairs)('%s', (_label, fg, bg) => {
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(AA_TEXT);
    });
  });
});
