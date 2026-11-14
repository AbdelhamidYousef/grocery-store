import { useT } from '../../i18n';

// First focusable element on every page: keyboard users jump past the header straight to <main>.
// Visible only while focused.
export function SkipLink() {
  const { t } = useT();
  return (
    <a
      href="#main"
      data-testid="skip-link"
      className="sr-only z-[60] rounded-control bg-ink px-4 py-3 font-display font-semibold text-surface focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
    >
      {t('shell.skipLink')}
    </a>
  );
}
