import { Outlet, ScrollRestoration } from 'react-router-dom';

import { Footer } from './Footer';
import { Header } from './Header';
import { SkipLink } from './SkipLink';

// The page frame every route renders inside (via <Outlet />). Landmarks: header (banner), nav
// (inside header/footer), main, footer (contentinfo). `tabIndex={-1}` lets the skip link move
// focus to <main> without making it a tab stop.
export function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink />
      <Header cartCount={0} />
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none" data-testid="main">
        <Outlet />
      </main>
      <Footer />
      {/* Restores scroll per history entry (back returns to where you were) and resets to the
          top on a new navigation; needs the data router. */}
      <ScrollRestoration />
    </div>
  );
}
