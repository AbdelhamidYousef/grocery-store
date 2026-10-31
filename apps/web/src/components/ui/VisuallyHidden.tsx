import type { ReactNode } from 'react';

// Text for screen readers only. `sr-only` keeps it in the accessibility tree, unlike display:none.
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
