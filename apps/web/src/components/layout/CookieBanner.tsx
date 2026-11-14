import { useState } from 'react';
import { Link } from 'react-router-dom';

import { useT } from '../../i18n';
import { acknowledgeNotice, hasSeenNotice } from '../../lib/consent';
import { buttonClasses } from '../ui/Button';

// A notice, not a gate: it does not block the page (no modal, no focus trap) because nothing here
// is waiting on a choice. It says exactly what is true today and goes away for good once seen.
// "Cookie details" is a link to the cookies page and also counts as seeing the notice.
export function CookieBanner() {
  const { t } = useT();
  const [seen, setSeen] = useState(hasSeenNotice);
  if (seen) return null;

  const dismiss = () => {
    acknowledgeNotice();
    setSeen(true);
  };

  return (
    <section
      aria-label={t('shell.cookie.label')}
      data-testid="cookie-banner"
      className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-ink bg-surface p-4 shadow-card"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-base">{t('shell.cookie.text')}</p>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            to="/cookies"
            onClick={dismiss}
            data-testid="cookie-details"
            className={buttonClasses('secondary', 'md')}
          >
            {t('shell.cookie.details')}
          </Link>
          <button
            type="button"
            onClick={dismiss}
            data-testid="cookie-ok"
            className={buttonClasses('primary', 'md')}
          >
            {t('shell.cookie.ok')}
          </button>
        </div>
      </div>
    </section>
  );
}
