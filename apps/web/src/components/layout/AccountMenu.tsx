import { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '../../features/auth/AuthProvider';
import { useLogout } from '../../features/auth/hooks';
import { ChevronDownIcon, UserIcon } from '../icons';

// A disclosure ("show/hide") menu, not an ARIA `role=menu`: it holds ordinary links, and the
// menu role would promise arrow-key behaviour we don't implement. The items switch between
// "Sign in / Create account" and "My account / Sign out" with the auth state.
export function AccountMenu() {
  const { user } = useAuth();
  const logout = useLogout();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (wrapper.current && !wrapper.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        wrapper.current?.querySelector('button')?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const itemClass =
    'flex min-h-11 items-center rounded-control px-3 font-semibold hover:bg-pet-soft';

  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Account"
        data-testid="account-menu-button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-control px-2 hover:bg-pet-soft"
      >
        <UserIcon />
        {user && (
          <span
            data-testid="account-name"
            className="hidden max-w-24 truncate text-sm font-semibold lg:block"
          >
            {user.firstName}
          </span>
        )}
        <ChevronDownIcon width={16} height={16} className="hidden sm:block" />
      </button>
      {open && (
        <div
          id={panelId}
          data-testid="account-menu"
          className="absolute right-0 top-full z-40 mt-2 w-48 rounded-card border border-line bg-surface p-2 shadow-card"
        >
          {user ? (
            <>
              <p className="truncate px-3 py-1 text-sm text-muted" data-testid="account-email">
                {user.email}
              </p>
              <Link to="/account" className={itemClass} onClick={() => setOpen(false)}>
                My account
              </Link>
              {user.role === 'admin' && (
                <Link to="/admin" className={itemClass} onClick={() => setOpen(false)}>
                  Admin
                </Link>
              )}
              <button
                type="button"
                data-testid="sign-out"
                disabled={logout.isPending}
                className={`${itemClass} w-full text-left disabled:opacity-60`}
                onClick={() =>
                  logout.mutate(undefined, {
                    onSuccess: () => {
                      setOpen(false);
                      void navigate('/');
                    },
                  })
                }
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className={itemClass} onClick={() => setOpen(false)}>
                Sign in
              </Link>
              <Link to="/register" className={itemClass} onClick={() => setOpen(false)}>
                Create account
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
