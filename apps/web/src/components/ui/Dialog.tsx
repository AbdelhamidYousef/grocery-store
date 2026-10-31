import { useEffect, useId, useRef, type ReactNode } from 'react';

import { cn } from '../../lib/cn';

interface DialogProps {
  open: boolean;
  /** Called for every way of closing: the X button, Escape, a backdrop click, or `open=false`. */
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** `left` / `right` turn the dialog into a full-height side drawer (mobile nav / mini cart). */
  placement?: 'center' | 'left' | 'right';
  className?: string;
}

// A native <dialog> opened with showModal(). The browser gives us, for free and correctly: the
// top layer, `inert` on everything behind it (that IS the focus trap: Tab cannot leave the
// dialog), Escape to close, and focus restored to the opener on close. A hand-rolled trap would
// re-implement all of that with more bugs.
export function Dialog({
  open,
  onClose,
  title,
  children,
  placement = 'center',
  className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // A modal dialog does not stop the page behind it from scrolling.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      data-testid="dialog"
      onClose={onClose}
      // With no padding on <dialog> itself, a click whose target is the dialog element is a click
      // on the backdrop.
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      className={cn(
        'bg-surface p-0 text-ink shadow-card',
        placement === 'center' && 'm-auto w-[calc(100%-2rem)] max-w-lg rounded-card',
        placement === 'left' &&
          'my-0 ml-0 mr-auto h-full max-h-none w-[min(20rem,88vw)] rounded-r-card',
        placement === 'right' &&
          'my-0 ml-auto mr-0 h-full max-h-none w-[min(26rem,94vw)] rounded-l-card',
        className,
      )}
    >
      {open && (
        <div className="flex flex-col gap-4 p-6">
          <div className="flex items-start justify-between gap-4">
            <h2 id={titleId} className="text-xl font-bold">
              {title}
            </h2>
            <button
              type="button"
              aria-label="Close"
              data-testid="dialog-close"
              onClick={() => ref.current?.close()}
              className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-pet-soft"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
