// @vitest-environment node
import { readFileSync } from 'node:fs';

import { DEPARTMENTS } from '@store/shared';
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

// Reads the variables of one block (":root" or "[data-dept='fruit-veg']") out of tokens.css, so the
// test checks the values that actually ship rather than a copy that could drift.
function readBlock(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(tokensCss)?.[1] ?? '';
  const vars: Record<string, string> = {};
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) vars[m[1]!] = m[2]!;
  return vars;
}

const root = readBlock(':root');
const departments = DEPARTMENTS.map((d) => d.slug);
const AA_TEXT = 4.5;

describe('design tokens meet WCAG AA for text', () => {
  it('finds every token it relies on', () => {
    expect(Object.keys(root).length).toBeGreaterThan(8);
    for (const slug of departments) {
      expect(Object.keys(readBlock(`[data-dept='${slug}']`)).sort()).toEqual([
        '--dept-accent',
        '--dept-soft',
        '--dept-strong',
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
    ['--color-ink', '--color-primary-bright'], // big green fills
    ['--color-ink', '--color-accent'], // citrus badges
    ['--color-ink', '--color-accent-soft'],
    ['--color-primary', '--color-bg'], // green text and links
    ['--color-primary', '--color-surface'],
    ['--color-primary', '--color-primary-soft'],
    ['--color-surface', '--color-primary-strong'],
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

  describe.each(departments)('department theme %s', (slug) => {
    const vars = readBlock(`[data-dept='${slug}']`);
    const ink = root['--color-ink']!;
    const pairs: [string, string, string][] = [
      ['ink on accent', ink, vars['--dept-accent']!],
      ['ink on soft', ink, vars['--dept-soft']!],
      ['strong on soft', vars['--dept-strong']!, vars['--dept-soft']!],
      ['strong on surface', vars['--dept-strong']!, root['--color-surface']!],
      ['strong on bg', vars['--dept-strong']!, root['--color-bg']!],
    ];
    it.each(pairs)('%s', (_label, fg, bg) => {
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(AA_TEXT);
    });
  });
});

describe('department themes', () => {
  it('give each of the ten departments its own accent, soft and strong colour', () => {
    expect(departments).toHaveLength(10);
    for (const role of ['--dept-accent', '--dept-soft', '--dept-strong']) {
      const values = departments.map((slug) => readBlock(`[data-dept='${slug}']`)[role]);
      expect(new Set(values).size, role).toBe(10);
    }
  });
});
