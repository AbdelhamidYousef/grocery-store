import { useId } from 'react';

import { SearchIcon } from '../../components/icons';
import { Button } from '../../components/ui/Button';
import { controlClasses } from '../../components/ui/Field';
import { TEST_IDS } from '../../lib/test-ids';

// A search box that applies on submit (Enter or the button), not on every keystroke: each applied
// search is a URL entry and an API call. `key={value}` remounts it when the URL changes from
// outside (Back, "Clear"), so the box always shows what is applied.
export function AdminSearch({
  label,
  hint,
  value,
  onSearch,
}: {
  label: string;
  hint: string;
  value: string;
  onSearch: (q: string) => void;
}) {
  const id = useId();
  return (
    <form
      key={value}
      role="search"
      className="flex flex-col gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        const input = new FormData(event.currentTarget).get('q');
        onSearch(typeof input === 'string' ? input.trim() : '');
      }}
    >
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          name="q"
          type="search"
          defaultValue={value}
          maxLength={100}
          aria-describedby={`${id}-hint`}
          data-testid={TEST_IDS.adminSearch}
          className={controlClasses}
        />
        <Button type="submit" variant="secondary" aria-label="Search">
          <SearchIcon width={18} height={18} />
        </Button>
      </div>
      <p id={`${id}-hint`} className="text-sm text-muted">
        {hint}
      </p>
    </form>
  );
}
