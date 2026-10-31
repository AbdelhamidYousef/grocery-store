import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { SearchIcon } from '../icons';

// Navigates to /search?q=... : list state lives in the URL (shareable, back-button friendly).
// On the search page the box shows the query from the URL, so the shopper can refine it. No
// suggestions-as-you-type on purpose: that needs a dedicated endpoint, debouncing and a combobox
// pattern, and is a good stretch goal; plain submit keeps scope (and the a11y surface) small.
export function SearchBox({ idPrefix, onSearch }: { idPrefix: string; onSearch?: () => void }) {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const urlQuery = pathname === '/search' ? (params.get('q') ?? '') : '';
  const [query, setQuery] = useState(urlQuery);
  const [seenUrlQuery, setSeenUrlQuery] = useState(urlQuery);
  // Follow the URL (back button, a link to another search, leaving the search page) by adjusting
  // state while rendering rather than in an effect, which would paint one stale frame first.
  if (seenUrlQuery !== urlQuery) {
    setSeenUrlQuery(urlQuery);
    setQuery(urlQuery);
  }
  const navigate = useNavigate();
  const inputId = `${idPrefix}-search`;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    void navigate(`/search?q=${encodeURIComponent(q)}`);
    onSearch?.();
  };

  return (
    <form role="search" onSubmit={submit} className="relative w-full" data-testid="search-form">
      <label htmlFor={inputId} className="sr-only">
        Search products
      </label>
      <input
        id={inputId}
        type="search"
        name="q"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search toys, beds, treats..."
        autoComplete="off"
        enterKeyHint="search"
        data-testid="search-input"
        className="min-h-11 w-full rounded-full border-2 border-muted bg-surface pl-4 pr-12 text-base text-ink placeholder:text-muted"
      />
      <button
        type="submit"
        aria-label="Search"
        data-testid="search-submit"
        className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-surface hover:bg-primary-hover"
      >
        <SearchIcon width={18} height={18} />
      </button>
    </form>
  );
}
