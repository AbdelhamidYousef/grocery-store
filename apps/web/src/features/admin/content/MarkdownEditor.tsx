import { useId } from 'react';

import { controlClasses } from '../../../components/ui/Field';
import { MarkdownBody } from '../../guides/MarkdownBody';

// A textarea next to a live preview. The preview is the same component the storefront uses, so
// "what you see" is the real rendering (and no raw HTML is rendered in it either). On a phone the
// two stack; from `lg` they sit side by side.
export function MarkdownEditor({
  label,
  value,
  onChange,
  error,
  rows = 14,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  error?: string | undefined;
  rows?: number;
}) {
  const id = useId();
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor={id} className="text-sm font-semibold">
          {label} (Markdown)
        </label>
        <textarea
          id={id}
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`${controlClasses} py-2 font-mono text-sm`}
          data-testid="markdown-input"
        />
        {error && (
          <p id={`${id}-error`} className="text-sm font-semibold text-danger">
            {error}
          </p>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold">Preview</p>
        <div
          className="mt-1.5 max-h-[28rem] overflow-auto rounded-card border-2 border-line bg-surface p-4"
          data-testid="markdown-preview"
          aria-live="polite"
        >
          {value.trim() ? (
            <MarkdownBody source={value} className="text-base" />
          ) : (
            <p className="text-muted">Nothing to preview yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
