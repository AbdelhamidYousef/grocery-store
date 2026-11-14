import type { StringKey } from '../../../i18n';

// Three small line drawings for "How to measure": neck, chest and length. Original artwork drawn
// for this project as inline SVG (see CREDITS.md). Decorative: the caption under each one says the
// same thing in words, so they are hidden from assistive technology.

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 3,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

// A side-on dog silhouette, the same body in all three figures.
function Body() {
  return (
    <g {...stroke}>
      <path d="M26 58c0-8 6-14 14-14h34c8 0 14 6 14 14v8c0 6-4 10-10 10H36c-6 0-10-4-10-10z" />
      <path d="M88 48l8-14c3-5 10-4 12 2l2 8" />
      <path d="M108 44c4 0 8 3 8 8s-4 7-8 7" />
      <path d="M38 76v14M52 76v14M72 76v14M86 76v14" />
      <path d="M26 56c-6-2-10-8-10-14" />
    </g>
  );
}

const tape = { ...stroke, strokeDasharray: '5 5', stroke: '#e11d48' } as const;

export function MeasureIllustration({ kind }: { kind: 'neck' | 'chest' | 'length' }) {
  return (
    <svg viewBox="0 0 130 100" width="130" height="100" aria-hidden="true" focusable="false">
      <Body />
      {kind === 'neck' && <path d="M84 40c5 6 5 22 0 30" {...tape} />}
      {kind === 'chest' && <path d="M58 42c6 8 6 28 0 36" {...tape} />}
      {kind === 'length' && (
        <>
          <path d="M20 96h82" {...tape} />
          <path d="M20 92v8M102 92v8" {...tape} strokeDasharray="0" />
        </>
      )}
    </svg>
  );
}

export const MEASURE_FIGURES = [
  { kind: 'neck', caption: 'pdp.size.measure.neck' },
  { kind: 'chest', caption: 'pdp.size.measure.chest' },
  { kind: 'length', caption: 'pdp.size.measure.length' },
] as const satisfies readonly { kind: string; caption: StringKey }[];
