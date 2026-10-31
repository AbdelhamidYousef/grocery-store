import type { SafetyNotice } from '@store/shared';
import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';
import { MarkdownBody } from '../guides/MarkdownBody';

const LABEL: Record<SafetyNotice['severity'], string> = {
  info: 'Notice',
  warning: 'Safety warning',
  recall: 'Product recall',
};

const TONE: Record<SafetyNotice['severity'], string> = {
  info: 'border-line bg-primary-soft',
  warning: 'border-ink bg-primary-soft',
  recall: 'border-danger bg-danger-soft',
};

// One notice. `role="alert"` is ONLY for a recall: it interrupts a screen reader, which is right
// for "stop using this product" and wrong for a general note. The severity word is written out,
// so the meaning never rests on colour alone.
export function SafetyNoticeBox({
  notice,
  action,
}: {
  notice: SafetyNotice;
  /** Extra control (the homepage banner's dismiss button). */
  action?: ReactNode;
}) {
  return (
    <section
      aria-label={`${LABEL[notice.severity]}: ${notice.title}`}
      {...(notice.severity === 'recall' && { role: 'alert' })}
      data-severity={notice.severity}
      data-testid="safety-notice"
      className={cn('rounded-card border-2 p-4', TONE[notice.severity])}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-lg font-bold">
          <span className="uppercase tracking-wide">{LABEL[notice.severity]}:</span> {notice.title}
        </h2>
        {action}
      </div>
      <MarkdownBody source={notice.bodyMd} className="mt-2 space-y-2 text-base" />
    </section>
  );
}
