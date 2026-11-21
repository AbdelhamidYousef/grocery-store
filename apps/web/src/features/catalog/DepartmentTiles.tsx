import { DEPARTMENTS } from '@store/shared';
import { Link } from 'react-router-dom';

import { DepartmentGlyph } from '../../components/icons';
import { useT } from '../../i18n';
import { departmentName } from '../navigation/department-names';

import { useCategories } from './queries';

// The names, links and colours come from the typed DEPARTMENTS constant so the tiles paint
// instantly; the product counts are the only API data, and they fill in when the request lands.
// On a phone the tiles are compact rows (icon beside the name), so the ten departments take about
// half a screen, not one and a half; from `sm` they are cards, five across on a wide screen.
// Counts are keyed by `departmentSlug`: store views translate category slugs (obst-gemuese).
export function DepartmentTiles() {
  const { t, tn } = useT();
  const { data: categories } = useCategories();
  const counts = new Map(categories?.map((c) => [c.departmentSlug, c.productCount]));

  return (
    <ul
      className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-5"
      data-testid="department-tiles"
    >
      {DEPARTMENTS.map((dept) => {
        const count = counts.get(dept.slug);
        return (
          <li key={dept.slug} data-dept={dept.slug} className="min-w-0">
            <Link
              to={`/c/${dept.slug}`}
              className="flex h-full items-center gap-3 rounded-card bg-dept-soft p-3 text-dept-strong shadow-card transition-transform hover:-translate-y-0.5 sm:flex-col sm:p-5 sm:text-center"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-dept-accent text-ink sm:h-16 sm:w-16">
                <DepartmentGlyph icon={dept.icon} className="h-6 w-6 sm:h-8 sm:w-8" />
              </span>
              <span className="flex min-w-0 flex-col sm:gap-2">
                <span className="font-display text-sm font-bold leading-tight sm:text-xl">
                  {departmentName(t, dept)}
                </span>
                <span className="min-h-4 text-xs font-semibold sm:min-h-5 sm:text-sm">
                  {count === undefined ? '' : tn('catalog.productCount', count)}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
