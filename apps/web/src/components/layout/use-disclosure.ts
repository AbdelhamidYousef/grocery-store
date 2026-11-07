import { useEffect, useId, useRef, useState } from 'react';

// The shared behaviour of a disclosure ("show/hide") panel: toggled by a button, closed by Escape
// (focus goes back to the button) and by a pointer press outside. Tab is NOT trapped: a
// disclosure holds ordinary links and buttons, so focus leaves it naturally and the panel stays
// until the shopper dismisses it or picks something.
export function useDisclosure() {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (wrapper.current && !wrapper.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return { open, setOpen, wrapper, button, panelId };
}
