import { DEPARTMENTS } from '@store/shared';
import { Link } from 'react-router-dom';

import { DepartmentGlyph } from '../../components/icons';
import { useT } from '../../i18n';
import { departmentName } from '../navigation/department-names';

import { useCategories } from './queries';

// The names, links and colours come from the typed DEPARTMENTS constant so the tiles paint
// instantly; the product counts are the only API data, and they fill in when the request lands.
// Two columns on a phone, five on a wide screen: ten departments make two even rows.
export function DepartmentTiles() {
  const { t, tn } = useT();
  const { data: categories } = useCategories();
  const counts = new Map(categories?.map((c) => [c.slug, c.productCount]));

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
              className="flex h-full flex-col items-center gap-2 rounded-card bg-dept-soft p-4 text-center text-dept-strong shadow-card transition-transform hover:-translate-y-0.5 sm:gap-3 sm:p-5"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-dept-accent text-ink sm:h-16 sm:w-16">
                <DepartmentGlyph icon={dept.icon} width={32} height={32} />
              </span>
              <span className="font-display text-lg font-bold leading-tight sm:text-xl">
                {departmentName(t, dept)}
              </span>
              <span className="min-h-5 text-sm font-semibold">
                {count === undefined ? '' : tn('catalog.productCount', count)}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
