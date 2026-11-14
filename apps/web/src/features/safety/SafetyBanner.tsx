import { useState } from 'react';

import { Container } from '../../components/layout/Container';
import { useT } from '../../i18n';

import { useActiveSafetyNotices } from './queries';
import { SafetyNoticeBox } from './SafetyNoticeBox';

const KEY = 'pawsome_dismissed_notices';

function readDismissed(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.sessionStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

// Top of the homepage: every active notice, each dismissible for THIS browser session only
// (sessionStorage), so a recall comes back tomorrow but does not nag on every page view today.
// The product page box, by contrast, is never dismissible.
export function SafetyBanner() {
  const { t } = useT();
  const { data } = useActiveSafetyNotices();
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const visible = (data ?? []).filter((n) => !dismissed.includes(n.id));
  if (visible.length === 0) return null;

  const dismiss = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    try {
      window.sessionStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Storage blocked: the notice is hidden until the page is reloaded, which is fine.
    }
  };

  return (
    <Container className="flex flex-col gap-3 pt-4" data-testid="safety-banner">
      {visible.map((notice) => (
        <SafetyNoticeBox
          key={notice.id}
          notice={notice}
          action={
            <button
              type="button"
              onClick={() => dismiss(notice.id)}
              aria-label={t('shell.safety.dismissAria', { title: notice.title })}
              className="inline-flex min-h-11 shrink-0 items-center rounded-control border-2 border-ink bg-surface px-3 font-display font-semibold hover:bg-pet-soft"
            >
              {t('shell.safety.dismiss')}
            </button>
          }
        />
      ))}
    </Container>
  );
}
