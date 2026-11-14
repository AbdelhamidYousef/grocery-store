import { Link } from 'react-router-dom';

import { ChevronRightIcon } from '../../components/icons';
import { useT } from '../../i18n';
import { cn } from '../../lib/cn';
import { TEST_IDS } from '../../lib/test-ids';

// Page numbers to show: always first and last, and a window around the current page, with `null`
// standing for a gap ("..."). 20 pages therefore never render 20 links on a phone.
export function pageWindow(page: number, totalPages: number): (number | null)[] {
  const wanted = new Set([1, totalPages, page - 1, page, page + 1]);
  const pages = [...wanted].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  pages.forEach((p, i) => {
    const prev = pages[i - 1];
    if (prev !== undefined && p - prev > 1) out.push(null);
    out.push(p);
  });
  return out;
}

interface PaginationProps {
  page: number;
  totalPages: number;
  /** Builds the link target for a page, so filters and sort in the URL are preserved. */
  hrefFor: (page: number) => string;
}

const item =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-control px-3 font-display font-semibold';

// Real links (not buttons): each page has its own URL, so Back works, middle-click works, and it
// is crawlable.
export function Pagination({ page, totalPages, hrefFor }: PaginationProps) {
  const { t } = useT();
  if (totalPages <= 1) return null;
  return (
    <nav
      aria-label={t('catalog.pagination.label')}
      data-testid={TEST_IDS.pagination}
      className="mt-8"
    >
      <ul className="flex flex-wrap items-center justify-center gap-1">
        <li>
          {page > 1 ? (
            <Link
              to={hrefFor(page - 1)}
              rel="prev"
              className={cn(item, 'border-2 border-ink hover:bg-pet-soft')}
            >
              <ChevronRightIcon className="mr-1 rotate-180" width={16} height={16} />{' '}
              {t('catalog.pagination.prev')}
            </Link>
          ) : (
            <span className={cn(item, 'opacity-40')} aria-hidden="true">
              <ChevronRightIcon className="mr-1 rotate-180" width={16} height={16} />{' '}
              {t('catalog.pagination.prev')}
            </span>
          )}
        </li>
        {pageWindow(page, totalPages).map((p, i) =>
          p === null ? (
            <li key={`gap-${i}`} aria-hidden="true" className="px-1 text-muted">
              ...
            </li>
          ) : (
            <li key={p}>
              <Link
                to={hrefFor(p)}
                aria-label={t('catalog.pagination.page', { page: p })}
                aria-current={p === page ? 'page' : undefined}
                className={cn(item, p === page ? 'bg-ink text-surface' : 'hover:bg-pet-soft')}
              >
                {p}
              </Link>
            </li>
          ),
        )}
        <li>
          {page < totalPages ? (
            <Link
              to={hrefFor(page + 1)}
              rel="next"
              className={cn(item, 'border-2 border-ink hover:bg-pet-soft')}
            >
              {t('catalog.pagination.next')}{' '}
              <ChevronRightIcon className="ml-1" width={16} height={16} />
            </Link>
          ) : (
            <span className={cn(item, 'opacity-40')} aria-hidden="true">
              {t('catalog.pagination.next')}{' '}
              <ChevronRightIcon className="ml-1" width={16} height={16} />
            </span>
          )}
        </li>
      </ul>
    </nav>
  );
}
