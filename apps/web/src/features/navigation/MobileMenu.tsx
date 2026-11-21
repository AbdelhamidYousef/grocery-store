import { DEPARTMENTS, departmentBySlug } from '@store/shared';
import { useId, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';

import { ChevronDownIcon, DepartmentGlyph } from '../../components/icons';
import { useT } from '../../i18n';
import { cn } from '../../lib/cn';

import { departmentName } from './department-names';
import { MAX_MENU_CATEGORIES } from './MegaMenu';
import { PromoTile } from './PromoTile';
import { useNavigation } from './queries';

const rowClass =
  'flex min-h-12 w-full items-center gap-3 rounded-control px-3 text-left font-display text-lg font-semibold hover:bg-dept-soft';
const subLink =
  'flex min-h-11 items-center rounded-control px-3 hover:bg-dept-soft aria-[current=page]:bg-dept-soft';

// The same menu inside the mobile drawer: one accordion level per department. The drawer itself is a
// modal <dialog> (focus trap, Escape and scroll lock come from it); every row is 44 px or more.
export function MobileMenu({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useT();
  const { data } = useNavigation();
  const [openDept, setOpenDept] = useState<string | null>(null);
  const baseId = useId();
  const departments = data?.departments ?? [];

  if (departments.length === 0) {
    return (
      <ul className="flex flex-col gap-1">
        {DEPARTMENTS.map((dept) => (
          <li key={dept.slug} data-dept={dept.slug}>
            <NavLink to={`/c/${dept.slug}`} onClick={onNavigate} className={rowClass}>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-dept-accent text-ink">
                <DepartmentGlyph icon={dept.icon} width={22} height={22} />
              </span>
              {departmentName(t, dept)}
            </NavLink>
          </li>
        ))}
        <li>
          <NavLink to="/brands" onClick={onNavigate} className={rowClass}>
            {t('shell.nav.brands')}
          </NavLink>
        </li>
      </ul>
    );
  }

  return (
    <ul className="flex flex-col gap-1">
      {departments.map((entry) => {
        const meta = departmentBySlug(entry.slug);
        const open = openDept === entry.slug;
        const panelId = `${baseId}-${entry.slug}`;
        return (
          <li key={entry.slug} data-dept={entry.slug}>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={panelId}
              data-testid="mobile-menu-button"
              onClick={() => setOpenDept(open ? null : entry.slug)}
              className={rowClass}
            >
              {meta && (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-dept-accent text-ink">
                  <DepartmentGlyph icon={meta.icon} width={22} height={22} />
                </span>
              )}
              <span className="min-w-0 flex-1">{entry.name}</span>
              <ChevronDownIcon
                width={20}
                height={20}
                className={cn('shrink-0 transition-transform', open && 'rotate-180')}
              />
            </button>
            {open && (
              <div id={panelId} className="mb-2 ml-3 border-l-2 border-line pl-3">
                <ul>
                  {entry.categories.slice(0, MAX_MENU_CATEGORIES).map((c) => (
                    <li key={c.slug}>
                      <Link to={`/c/${c.slug}`} onClick={onNavigate} className={subLink}>
                        {c.name}
                      </Link>
                    </li>
                  ))}
                  <li>
                    <Link
                      to={`/c/${entry.slug}`}
                      onClick={onNavigate}
                      className={`${subLink} font-semibold text-primary-strong`}
                    >
                      {t(
                        entry.categories.length > MAX_MENU_CATEGORIES
                          ? 'shell.nav.seeAll'
                          : 'shell.nav.all',
                        { name: entry.name },
                      )}
                    </Link>
                  </li>
                </ul>
                {entry.brands.length > 0 && (
                  <>
                    <p className="mt-2 px-3 font-display text-sm font-bold text-muted">
                      {t('shell.nav.brands')}
                    </p>
                    <ul>
                      {entry.brands.map((b) => (
                        <li key={b.slug}>
                          <Link to={`/brands/${b.slug}`} onClick={onNavigate} className={subLink}>
                            {b.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {entry.promo && (
                  <div className="mt-3">
                    <PromoTile promo={entry.promo} onNavigate={onNavigate} />
                  </div>
                )}
              </div>
            )}
          </li>
        );
      })}
      <li>
        <NavLink to="/brands" onClick={onNavigate} className={rowClass}>
          {t('shell.nav.brands')}
        </NavLink>
      </li>
    </ul>
  );
}
