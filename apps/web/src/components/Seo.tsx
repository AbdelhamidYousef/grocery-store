import { useEffect } from 'react';

const SITE = 'Pawsome';

interface SeoProps {
  title: string;
  description?: string;
  /** Absolute or root-relative URL of the preferred version of this page. */
  canonical?: string;
  noindex?: boolean;
}

// Sets <title>, meta description, canonical link and robots through the DOM in an effect: a
// handful of lines instead of a dependency, and it needs no `window` at import time. A SPA only
// shows these to crawlers that run JS; the plan's later SEO project would prerender them, and
// that step can reuse this same prop shape.
function upsert(selector: string, create: () => HTMLElement): HTMLElement {
  const existing = document.head.querySelector<HTMLElement>(selector);
  if (existing) return existing;
  const el = create();
  document.head.appendChild(el);
  return el;
}

export function Seo({ title, description, canonical, noindex }: SeoProps) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title === SITE ? SITE : `${title} | ${SITE}`;
    return () => {
      document.title = previousTitle;
    };
  }, [title]);

  useEffect(() => {
    if (!description) return;
    const meta = upsert('meta[name="description"]', () => {
      const el = document.createElement('meta');
      el.setAttribute('name', 'description');
      return el;
    });
    const previous = meta.getAttribute('content');
    meta.setAttribute('content', description);
    return () => {
      if (previous === null) meta.remove();
      else meta.setAttribute('content', previous);
    };
  }, [description]);

  useEffect(() => {
    if (!canonical) return;
    const link = upsert('link[rel="canonical"]', () => {
      const el = document.createElement('link');
      el.setAttribute('rel', 'canonical');
      return el;
    });
    link.setAttribute('href', canonical);
    return () => link.remove();
  }, [canonical]);

  useEffect(() => {
    if (!noindex) return;
    const meta = upsert('meta[name="robots"]', () => {
      const el = document.createElement('meta');
      el.setAttribute('name', 'robots');
      return el;
    });
    meta.setAttribute('content', 'noindex');
    return () => meta.remove();
  }, [noindex]);

  return null;
}
