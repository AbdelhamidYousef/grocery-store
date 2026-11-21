import { DEPARTMENTS, departmentBySlug } from '@store/shared';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';

import { ChevronDownIcon, DepartmentGlyph } from '../../components/icons';
import { useT } from '../../i18n';

import { departmentName } from './department-names';
import { PromoTile } from './PromoTile';
import { useNavigation } from './queries';

// A department with more categories than this shows the first ones and a "See all" link, so one
// panel never grows past a screen however the catalogue grows.
export const MAX_MENU_CATEGORIES = 8;
// Hover opens after a short pause (so a mouse crossing the bar does not flash every panel) and
// closes after one (so the pointer can travel from the button to the panel).
const INTENT_MS = 150;

const linkClass =
  'flex min-h-11 items-center rounded-control px-3 hover:bg-dept-soft aria-[current=page]:bg-dept-soft';

// Ten departments and "Brands" share one row, so the pills are compact: the round icon appears only
// on wide screens, where there is room for it.
const pillClass =
  'flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full px-3 font-display text-[0.95rem] font-semibold hover:bg-dept-soft aria-[current=page]:bg-dept-soft';
const iconClass =
  'hidden h-7 w-7 items-center justify-center rounded-full bg-dept-accent text-ink 2xl:flex';

// The desktop "shop by department" bar. Disclosure navigation (WAI-ARIA APG), not a `menu` role: each
// department is a button with `aria-expanded` that shows a panel of ordinary links, so
//  - Enter / Space / click toggles; hover opens it too, but nothing depends on hover;
//  - Escape closes the panel and puts focus back on its button;
//  - Tab walks into the panel and out the other side (no trap); leaving it closes it;
//  - only one panel is open at a time.
// While the data loads or if it fails, the bar is plain links to each department's page.
export function MegaMenu() {
  const { t } = useT();
  const { data } = useNavigation();
  const [openDept, setOpenDept] = useState<string | null>(null);
  const bar = useRef<HTMLUListElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const baseId = useId();

  const later = (fn: () => void) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(fn, INTENT_MS);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (!openDept) return;
    const onPointerDown = (event: PointerEvent) => {
      if (bar.current && !bar.current.contains(event.target as Node)) setOpenDept(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpenDept(null);
      bar.current?.querySelector<HTMLButtonElement>(`[data-menu-button="${openDept}"]`)?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openDept]);

  const departments = data?.departments ?? [];

  return (
    <ul ref={bar} className="flex items-center gap-2 py-2" data-testid="main-nav">
      {departments.length === 0
        ? DEPARTMENTS.map((dept) => (
            <li key={dept.slug} data-dept={dept.slug}>
              <NavLink to={`/c/${dept.slug}`} className={pillClass}>
                <span className={iconClass}>
                  <DepartmentGlyph icon={dept.icon} width={18} height={18} />
                </span>
                {departmentName(t, dept)}
              </NavLink>
            </li>
          ))
        : departments.map((entry) => {
            const meta = departmentBySlug(entry.slug);
            const open = openDept === entry.slug;
            const panelId = `${baseId}-${entry.slug}`;
            const shown = entry.categories.slice(0, MAX_MENU_CATEGORIES);
            return (
              <li
                key={entry.slug}
                data-dept={entry.slug}
                data-testid="menu-item"
                onPointerEnter={(e) => {
                  // Touch has no hover: a tap is a click, which the button handles.
                  if (e.pointerType === 'mouse') later(() => setOpenDept(entry.slug));
                }}
                onPointerLeave={(e) => {
                  if (e.pointerType === 'mouse')
                    later(() => setOpenDept((c) => (c === entry.slug ? null : c)));
                }}
                onBlur={(e) => {
                  // Tabbing out of the item (button + panel) closes it; moving inside keeps it.
                  if (!e.currentTarget.contains(e.relatedTarget)) {
                    setOpenDept((c) => (c === entry.slug ? null : c));
                  }
                }}
              >
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={panelId}
                  data-menu-button={entry.slug}
                  data-testid="menu-button"
                  onClick={() => {
                    clearTimeout(timer.current);
                    setOpenDept(open ? null : entry.slug);
                  }}
                  className={pillClass}
                >
                  {meta && (
                    <span className={iconClass}>
                      <DepartmentGlyph icon={meta.icon} width={18} height={18} />
                    </span>
                  )}
                  {entry.name}
                  <ChevronDownIcon width={16} height={16} />
                </button>
                {open && (
                  <div
                    id={panelId}
                    data-testid="menu-panel"
                    // A panel is a region the shopper can skip; the bar's own links stay reachable.
                    className="absolute inset-x-0 top-full z-40 max-h-[70vh] overflow-y-auto border-b border-line bg-surface shadow-card"
                  >
                    <div className="mx-auto grid w-full max-w-7xl grid-cols-[1fr_1fr_18rem] gap-8 px-6 py-6">
                      {/* Plain text, not headings: a panel opens above the page's own h1, and a heading
                          level cannot be skipped. The sections are named by aria-label. */}
                      <section aria-label={t('shell.nav.categoriesOf', { name: entry.name })}>
                        <p className="mb-2 font-display text-lg font-bold">
                          {t('shell.nav.shop', { name: entry.name })}
                        </p>
                        <ul>
                          {shown.map((c) => (
                            <li key={c.slug}>
                              <Link
                                to={`/c/${c.slug}`}
                                onClick={() => setOpenDept(null)}
                                className={linkClass}
                              >
                                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                                <span className="ml-2 text-sm text-muted">{c.productCount}</span>
                              </Link>
                            </li>
                          ))}
                          <li>
                            <Link
                              to={`/c/${entry.slug}`}
                              onClick={() => setOpenDept(null)}
                              className={`${linkClass} font-semibold text-primary-strong`}
                              data-testid="menu-see-all"
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
                      </section>
                      <section aria-label={t('shell.nav.brandsOf', { name: entry.name })}>
                        <p className="mb-2 font-display text-lg font-bold">
                          {t('shell.nav.brands')}
                        </p>
                        <ul>
                          {entry.brands.map((b) => (
                            <li key={b.slug}>
                              <Link
                                to={`/brands/${b.slug}`}
                                onClick={() => setOpenDept(null)}
                                className={linkClass}
                              >
                                <span className="min-w-0 truncate">{b.name}</span>
                              </Link>
                            </li>
                          ))}
                          <li>
                            <Link
                              to="/brands"
                              onClick={() => setOpenDept(null)}
                              className={`${linkClass} font-semibold text-primary-strong`}
                            >
                              {t('shell.nav.allBrands')}
                            </Link>
                          </li>
                        </ul>
                      </section>
                      <div>
                        {entry.promo && (
                          <PromoTile promo={entry.promo} onNavigate={() => setOpenDept(null)} />
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
      <li>
        <NavLink to="/brands" className={pillClass}>
          {t('shell.nav.brands')}
        </NavLink>
      </li>
    </ul>
  );
}
