import type { ReactNode } from 'react';

import { Button } from '../../components/ui/Button';
import { cn } from '../../lib/cn';
import { TEST_IDS } from '../../lib/test-ids';

export type StepState = 'active' | 'done' | 'locked';

// One of the three checkout sections. Progressive disclosure: only the active step shows its
// form; a finished step collapses to a one-line summary with an Edit button, and a step that is
// still ahead shows just its heading. `aria-current="step"` marks the active one for screen
// readers, and the heading is a real <h2> so the page outline reads Contact, Shipping, Payment.
export function StepCard({
  number,
  title,
  state,
  summary,
  onEdit,
  children,
  id,
}: {
  number: number;
  title: string;
  state: StepState;
  summary?: ReactNode;
  onEdit?: () => void;
  children: ReactNode;
  id: string;
}) {
  return (
    <section
      aria-labelledby={`${id}-heading`}
      aria-current={state === 'active' ? 'step' : undefined}
      data-testid={TEST_IDS.checkoutStep}
      data-step={id}
      data-state={state}
      className={cn(
        'rounded-card border-2 bg-surface p-4 sm:p-6',
        state === 'active' ? 'border-ink shadow-card' : 'border-line',
        state === 'locked' && 'text-muted',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display font-bold',
            state === 'done' ? 'bg-success text-surface' : 'bg-ink text-surface',
            state === 'locked' && 'bg-line text-ink',
          )}
        >
          {state === 'done' ? '✓' : number}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={`${id}-heading`} className="font-display text-xl font-bold">
            {title}
          </h2>
          {state === 'done' && summary && (
            <div className="mt-1 break-words text-ink">{summary}</div>
          )}
        </div>
        {state === 'done' && onEdit && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            data-testid={TEST_IDS.checkoutEdit}
            aria-label={`Edit ${title.toLowerCase()}`}
          >
            Edit
          </Button>
        )}
      </div>
      {state === 'active' && <div className="mt-5">{children}</div>}
    </section>
  );
}
