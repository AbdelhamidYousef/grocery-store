import { useEffect, useRef } from 'react';
import { Outlet, ScrollRestoration, useLocation } from 'react-router-dom';

import { Footer } from './Footer';
import { Header } from './Header';
import { SkipLink } from './SkipLink';

// The page frame every route renders inside (via <Outlet />). Landmarks: header (banner), nav
// (inside header/footer), main, footer (contentinfo). `tabIndex={-1}` lets the skip link move
// focus to <main> without making it a tab stop.
export function AppLayout() {
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const lastPath = useRef(pathname);

  // Focus management on route change: a SPA navigation does not reload the page, so without this
  // keyboard focus stays on the link that was clicked (now gone or off-screen) and a screen reader
  // hears nothing. Moving focus to <main> makes it read the new page. Keyed on pathname only, so
  // changing filters or sort (search params) does not yank focus away from the control in use.
  // Skipped on first load: the browser's own start-of-page focus is right there.
  useEffect(() => {
    // Compare with the last path instead of a "first render" flag: StrictMode runs effects twice
    // on mount, and a flag would be spent by the first run and steal focus on the second.
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink />
      <Header cartCount={0} />
      <main
        ref={mainRef}
        id="main"
        tabIndex={-1}
        className="flex-1 focus:outline-none"
        data-testid="main"
      >
        <Outlet />
      </main>
      <Footer />
      {/* Restores scroll per history entry (back returns to where you were) and resets to the
          top on a new navigation; needs the data router. */}
      <ScrollRestoration />
    </div>
  );
}
