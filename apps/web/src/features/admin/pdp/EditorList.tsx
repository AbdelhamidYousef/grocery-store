import type { ReactNode } from 'react';

import { Button } from '../../../components/ui/Button';

// The row chrome the list editors share: move up, move down, remove. Plain buttons with names that
// say which row (`Move FAQ 2 up`), so a screen reader user never meets three anonymous "Remove"s.
export function RowControls({
  noun,
  index,
  count,
  onMove,
  onRemove,
}: {
  noun: string;
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
}) {
  const n = index + 1;
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={index === 0}
        onClick={() => onMove(index, index - 1)}
      >
        Move {noun} {n} up
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={index === count - 1}
        onClick={() => onMove(index, index + 1)}
      >
        Move {noun} {n} down
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => onRemove(index)}>
        Remove {noun} {n}
      </Button>
    </div>
  );
}

export function EditorSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h4 className="font-display text-base font-bold">{title}</h4>
        {hint && <p className="text-sm text-muted">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item === undefined) return list;
  next.splice(to, 0, item);
  return next;
}
