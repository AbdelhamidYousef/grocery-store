import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * A page opened under a slug that is not the store view's own (an English link in the German
 * store, or a link shared from another store) replaces its URL with the right one. The API answers
 * with the slug of the active language; nothing happens while that is the slug already in the URL.
 */
export function useCanonicalSlug(section: string, slug: string | undefined, canonical?: string) {
  const navigate = useNavigate();
  const { search, hash } = useLocation();
  useEffect(() => {
    if (slug && canonical && canonical !== slug) {
      navigate(`/${section}/${encodeURIComponent(canonical)}${search}${hash}`, { replace: true });
    }
  }, [navigate, section, slug, canonical, search, hash]);
}
