import type { SafetyNotice } from '@store/shared';
import type { ReactNode } from 'react';

import { useT, type StringKey } from '../../i18n';
import { cn } from '../../lib/cn';
import { MarkdownBody } from '../guides/MarkdownBody';

const LABEL: Record<SafetyNotice['severity'], StringKey> = {
  info: 'shell.safety.info',
  warning: 'shell.safety.warning',
  recall: 'shell.safety.recall',
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
  const { t } = useT();
  const label = t(LABEL[notice.severity]);
  return (
    <section
      aria-label={t('shell.safety.noticeAria', { label, title: notice.title })}
      {...(notice.severity === 'recall' && { role: 'alert' })}
      data-severity={notice.severity}
      data-testid="safety-notice"
      className={cn('rounded-card border-2 p-4', TONE[notice.severity])}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-lg font-bold">
          <span className="uppercase tracking-wide">{t('shell.safety.labelColon', { label })}</span>{' '}
          {notice.title}
        </h2>
        {action}
      </div>
      <MarkdownBody source={notice.bodyMd} className="mt-2 space-y-2 text-base" />
    </section>
  );
}
