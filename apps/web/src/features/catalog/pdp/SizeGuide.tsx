import type { SizeGuide, Variant } from '@store/shared';
import { useState } from 'react';

import { Dialog } from '../../../components/ui/Dialog';
import { TEST_IDS } from '../../../lib/test-ids';

import { MEASURE_FIGURES, MeasureIllustration } from './MeasureIllustrations';

// "1. Measure the neck." lines become an ordered list; any other line stays a plain paragraph. The
// how-to is admin-written plain text, so there is no Markdown engine and nothing to sanitise.
export function parseHowTo(text: string): { steps: string[]; notes: string[] } {
  const steps: string[] = [];
  const notes: string[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const step = /^\d+[.)]\s+(.*)$/.exec(line);
    if (step?.[1]) steps.push(step[1]);
    else notes.push(line);
  }
  return { steps, notes };
}

/** The row of the guide the selected variant belongs to: the one whose size code is one of its options. */
export function rowForVariant(guide: SizeGuide, variant: Variant | undefined) {
  if (!variant) return undefined;
  const values = Object.values(variant.options);
  return guide.rows.find((r) => values.includes(r.size));
}

// The button next to the size picker and the dialog it opens. The native <dialog> (see Dialog.tsx)
// gives the focus trap, Escape, focus back on the button, and page scroll lock.
export function SizeGuideButton({
  guide,
  variant,
}: {
  guide: SizeGuide;
  variant: Variant | undefined;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        data-testid={TEST_IDS.sizeGuideButton}
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center gap-2 self-start font-semibold text-primary-strong underline"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none">
          <path
            d="M3 17L17 3l4 4L7 21zM8 12l2 2M11 9l2 2M14 6l2 2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Size guide
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={guide.title}
        className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto"
      >
        <SizeGuideContent guide={guide} variant={variant} />
      </Dialog>
    </>
  );
}

function SizeGuideContent({ guide, variant }: { guide: SizeGuide; variant: Variant | undefined }) {
  const selected = rowForVariant(guide, variant);
  const { steps, notes } = parseHowTo(guide.howtoMd);
  return (
    <div className="flex flex-col gap-5" data-testid="size-guide">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[20rem] text-left">
          <thead>
            <tr className="border-b-2 border-line">
              <th scope="col" className="py-2 pr-3">
                Size
              </th>
              {guide.columns.map((c) => (
                <th key={c} scope="col" className="py-2 pr-3">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {guide.rows.map((row) => {
              const isSelected = row === selected;
              return (
                <tr
                  key={row.size}
                  data-selected={isSelected || undefined}
                  className={isSelected ? 'bg-pet-soft font-semibold' : undefined}
                >
                  <th scope="row" className="py-2 pr-3">
                    {row.label}
                    {isSelected && (
                      <span className="ml-2 text-sm text-pet-strong">(your size)</span>
                    )}
                  </th>
                  {guide.columns.map((c, i) => (
                    <td key={c} className="py-2 pr-3">
                      {row.values[i] ?? ''}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {guide.tip && (
        <p data-testid="size-guide-tip" className="rounded-card bg-pet-soft p-3 font-semibold">
          {guide.tip}
        </p>
      )}
      {(steps.length > 0 || notes.length > 0) && (
        <section aria-labelledby="measure-heading">
          <h3 id="measure-heading" className="font-display text-lg font-bold">
            How to measure
          </h3>
          <ul className="mt-2 flex flex-wrap justify-center gap-4">
            {MEASURE_FIGURES.map((f) => (
              <li key={f.kind} className="flex flex-col items-center text-pet-strong">
                <MeasureIllustration kind={f.kind} />
                <span className="text-sm font-semibold text-ink">{f.caption}</span>
              </li>
            ))}
          </ul>
          {steps.length > 0 && (
            <ol className="mt-3 list-decimal pl-6">
              {steps.map((s, i) => (
                <li key={i} className="py-0.5">
                  {s}
                </li>
              ))}
            </ol>
          )}
          {notes.map((n, i) => (
            <p key={i} className="mt-2">
              {n}
            </p>
          ))}
        </section>
      )}
    </div>
  );
}
