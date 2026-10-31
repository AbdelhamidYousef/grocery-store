import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { SearchIcon } from '../icons';

// Navigates to /search?q=... : list state lives in the URL (shareable, back-button friendly).
// Phase 5.5 keeps the query in the box on the search page.
export function SearchBox({ idPrefix, onSearch }: { idPrefix: string; onSearch?: () => void }) {
  const [query, setQuery] = useState('');
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
