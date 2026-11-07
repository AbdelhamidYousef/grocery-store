import { useQuery } from '@tanstack/react-query';
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { fetchSuggestions } from '../../api/search';
import { SearchIcon } from '../../components/icons';
import { cn } from '../../lib/cn';

import {
  addRecentSearch,
  clearRecentSearches,
  getRecentSearches,
  removeRecentSearch,
  subscribeRecent,
} from './recent-searches';
import {
  announce,
  groupSuggestions,
  isSearchable,
  recentGroup,
  searchUrl,
  type OptionGroup,
  type SuggestionOption,
} from './suggestions';
import { useDebounced } from './use-debounced';

const DEBOUNCE_MS = 200;
const MOBILE_QUERY = '(max-width: 1023px)';

interface SearchComboboxProps {
  idPrefix: string;
  /** Called after the shopper has navigated somewhere (the mobile drawer closes itself). */
  onSearch?: (() => void) | undefined;
}

// The WAI-ARIA 1.2 "editable combobox with list autocomplete" pattern:
//  - DOM focus stays in the input; the highlighted option is `aria-activedescendant`;
//  - Down/Up move through the options (wrapping), Home/End jump when one is highlighted,
//    Enter opens the highlighted option or, with none, runs the plain search, Escape closes the
//    list (a second Escape clears the text), Delete forgets a highlighted recent search;
//  - the list is a `listbox` of `group`s of `option`s, and a polite live region says how many
//    suggestions arrived ("5 products, 2 brands");
//  - on a phone the focused box becomes a full-screen overlay (same component, same markup).
export function SearchCombobox({ idPrefix, onSearch }: SearchComboboxProps) {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const urlQuery = pathname === '/search' ? (params.get('q') ?? '') : '';
  const [query, setQuery] = useState(urlQuery);
  const [seenUrlQuery, setSeenUrlQuery] = useState(urlQuery);
  // Follow the URL (back button, a link to another search, leaving the search page) by adjusting
  // state while rendering rather than in an effect, which would paint one stale frame first.
  if (seenUrlQuery !== urlQuery) {
    setSeenUrlQuery(urlQuery);
    setQuery(urlQuery);
  }

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [overlay, setOverlay] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const ids = useId();
  const inputId = `${idPrefix}-search`;
  const listId = `${idPrefix}-suggestions${ids}`;
  const optionId = (i: number) => `${idPrefix}-option-${i}`;

  const trimmed = query.trim();
  const term = useDebounced(trimmed, DEBOUNCE_MS);
  const typed = isSearchable(trimmed);
  const suggest = useQuery({
    queryKey: ['search', 'suggest', term],
    queryFn: ({ signal }) => fetchSuggestions(term, signal),
    // Only for the settled term, and only while the list is open: no request for a box nobody
    // is using, none for one character, none for a term the shopper has already typed past.
    enabled: open && isSearchable(term),
    staleTime: 30_000,
  });
  const recents = useSyncExternalStore(subscribeRecent, getRecentSearches);

  // What is listed. Typing shows suggestions for the term the debounce has settled on; the
  // answer for an older term is never shown for newer text. An empty box shows recents.
  const settled = typed && term === trimmed;
  let groups: OptionGroup[] = [];
  let status = '';
  if (!typed) {
    groups = recentGroup(recents);
    status = groups.length > 0 ? `${recents.length} recent searches` : '';
  } else if (settled && suggest.data) {
    groups = groupSuggestions(suggest.data);
    status = announce(suggest.data);
  } else if (settled && suggest.isError) {
    status = 'Suggestions are unavailable. Press Enter to search.';
  } else {
    status = 'Searching';
  }
  const options: SuggestionOption[] = groups.flatMap((g) => g.options);
  const listOpen = open && options.length > 0;
  const showMessage = open && options.length === 0 && typed && status !== '';

  const close = () => {
    setOpen(false);
    setActive(-1);
    setOverlay(false);
  };

  // A phone's overlay covers the page, so the page behind must not scroll with it.
  useEffect(() => {
    if (!overlay) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [overlay]);

  const go = (to: string) => {
    close();
    input.current?.blur();
    void navigate(to);
    onSearch?.();
  };

  const pick = (option: SuggestionOption) => {
    if (isSearchable(trimmed) || option.kind === 'recent') {
      addRecentSearch(option.kind === 'recent' ? option.label : trimmed);
    }
    go(option.to);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const chosen = active >= 0 ? options[active] : undefined;
    if (chosen) return pick(chosen);
    if (!trimmed) return;
    addRecentSearch(trimmed);
    go(searchUrl(trimmed));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const count = options.length;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) setOpen(true);
        else if (count > 0) setActive((a) => (a + 1) % count);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!open) setOpen(true);
        else if (count > 0) setActive((a) => (a <= 0 ? count - 1 : a - 1));
        break;
      case 'Home':
        if (listOpen && active >= 0) {
          event.preventDefault();
          setActive(0);
        }
        break;
      case 'End':
        if (listOpen && active >= 0) {
          event.preventDefault();
          setActive(count - 1);
        }
        break;
      case 'Escape':
        event.preventDefault();
        if (open) close();
        else setQuery('');
        break;
      case 'Delete': {
        const current = active >= 0 ? options[active] : undefined;
        if (current?.kind === 'recent') {
          event.preventDefault();
          removeRecentSearch(current.label);
          setActive(-1);
        }
        break;
      }
    }
  };

  return (
    <div
      ref={wrapper}
      data-testid="search-combobox"
      className={cn(
        overlay ? 'fixed inset-0 z-50 overflow-y-auto bg-surface p-4' : 'relative w-full',
      )}
      onBlur={(event) => {
        // Focus moving to something inside (the Clear button) keeps the list; leaving closes it.
        if (!wrapper.current?.contains(event.relatedTarget)) close();
      }}
    >
      <form role="search" onSubmit={submit} className="relative flex w-full items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <label htmlFor={inputId} className="sr-only">
            Search products
          </label>
          <input
            ref={input}
            id={inputId}
            type="text"
            name="q"
            role="combobox"
            aria-expanded={listOpen}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={listOpen && active >= 0 ? optionId(active) : undefined}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setActive(-1);
            }}
            onFocus={() => {
              setOpen(true);
              if (window.matchMedia?.(MOBILE_QUERY).matches) setOverlay(true);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search toys, beds, treats..."
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
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
        </div>
        {overlay && (
          <button
            type="button"
            data-testid="search-cancel"
            onClick={() => {
              close();
              input.current?.blur();
            }}
            className="min-h-11 shrink-0 rounded-control px-2 font-display font-semibold text-primary-strong"
          >
            Cancel
          </button>
        )}
      </form>

      {/* Polite live region: always in the DOM so the first announcement is not lost. */}
      <div role="status" aria-live="polite" className="sr-only" data-testid="search-status">
        {open ? status : ''}
      </div>

      {(listOpen || showMessage) && (
        <div
          data-testid="search-popup"
          className={cn(
            'rounded-card border border-line bg-surface p-2 shadow-card',
            overlay
              ? 'mt-3'
              : 'absolute left-0 right-0 top-full z-40 mt-2 max-h-[70vh] overflow-y-auto',
          )}
        >
          {listOpen && (
            <div id={listId} role="listbox" aria-label="Search suggestions">
              {groups.map((group, groupIndex) => (
                <div key={group.id} role="group" aria-labelledby={`${listId}-${group.id}`}>
                  <div
                    id={`${listId}-${group.id}`}
                    role="presentation"
                    className="px-3 pb-1 pt-2 font-display text-sm font-bold text-muted"
                  >
                    {group.label}
                  </div>
                  {group.options.map((option, i) => {
                    // Position in the one flat list the arrow keys walk through.
                    const index =
                      groups.slice(0, groupIndex).reduce((n, g) => n + g.options.length, 0) + i;
                    return (
                      <div
                        key={`${option.kind}:${option.label}:${index}`}
                        id={optionId(index)}
                        role="option"
                        aria-selected={active === index}
                        data-testid="search-option"
                        data-kind={option.kind}
                        // The input keeps focus, so a press must not move it.
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pick(option)}
                        className={cn(
                          'flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-3 py-1 hover:bg-pet-soft',
                          active === index && 'bg-pet-soft ring-2 ring-ink',
                        )}
                      >
                        {option.image && (
                          <img
                            src={option.image}
                            alt=""
                            width={40}
                            height={40}
                            className="h-10 w-10 shrink-0 rounded-control object-cover"
                          />
                        )}
                        <span className="min-w-0 flex-1 truncate font-semibold">
                          {option.label}
                        </span>
                        {option.secondary && (
                          <span className="shrink-0 text-sm text-muted">{option.secondary}</span>
                        )}
                        {option.kind === 'recent' && (
                          // Mouse affordance only (it is no control: the keyboard way is Delete,
                          // and a button inside a listbox would break the pattern).
                          <span
                            aria-hidden="true"
                            data-testid="recent-remove"
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-line"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeRecentSearch(option.label);
                            }}
                          >
                            &times;
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
          {showMessage && (
            <p className="px-3 py-2 text-sm text-muted" data-testid="search-message">
              {status === 'Searching'
                ? 'Searching...'
                : status === 'No suggestions'
                  ? `No suggestions. Press Enter to search for "${trimmed}".`
                  : status}
            </p>
          )}
          {listOpen && groups[0]?.id === 'recent' && (
            <button
              type="button"
              data-testid="recent-clear"
              onClick={() => {
                clearRecentSearches();
                input.current?.focus();
              }}
              className="mt-1 min-h-11 w-full rounded-control px-3 text-left text-sm font-semibold text-primary-strong underline underline-offset-2"
            >
              Clear recent searches
            </button>
          )}
        </div>
      )}
    </div>
  );
}
