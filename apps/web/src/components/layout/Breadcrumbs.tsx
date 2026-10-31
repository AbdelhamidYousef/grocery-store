import { Link } from 'react-router-dom';

import { ChevronRightIcon } from '../icons';

export interface Crumb {
  label: string;
  /** Omit on the current page (the last crumb). */
  to?: string;
}

export function Breadcrumbs({ items }: { items: readonly Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" data-testid="breadcrumbs">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-sm text-muted">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">
              {item.to && !isLast ? (
                <Link
                  to={item.to}
                  className="inline-flex min-h-9 items-center rounded-control px-1 font-semibold text-primary-strong underline-offset-2 hover:underline"
                >
                  {item.label}
                </Link>
              ) : (
                // Long product names are truncated so the trail never forces horizontal scroll.
                <span
                  aria-current={isLast ? 'page' : undefined}
                  className="max-w-[60vw] truncate px-1 font-semibold text-ink sm:max-w-md"
                >
                  {item.label}
                </span>
              )}
              {!isLast && <ChevronRightIcon width={16} height={16} />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
