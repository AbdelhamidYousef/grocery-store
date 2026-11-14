import { DEFAULT_STORE, STORES } from '@store/shared';
import { useEffect } from 'react';

import { useStorePath } from '../features/stores/StoreContext';

const SITE = 'Pawsome';

interface SeoProps {
  title: string;
  description?: string;
  /**
   * Absolute or root-relative URL of the preferred version of this page. A root-relative one is
   * written WITHOUT the store prefix; Seo adds the current store's prefix and, from the same path,
   * the hreflang alternates for every store view.
   */
  canonical?: string;
  /** Set false on a page that exists in one store view only (no hreflang links). */
  alternates?: boolean;
  noindex?: boolean;
  /** `article` adds the Open Graph article tags (guides); everything else stays a plain page. */
  type?: 'website' | 'article';
  /** ISO date; only meaningful for `article`. */
  publishedAt?: string;
  image?: string;
  /** Structured data (schema.org) for this page, written as one JSON-LD script. */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
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

export function Seo({
  title,
  description,
  canonical,
  alternates = true,
  noindex,
  type = 'website',
  publishedAt,
  image,
  jsonLd,
}: SeoProps) {
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

  const storePath = useStorePath();
  // Root-relative (`/c/dogs`, not `//host`) means "a page of this shop": it gets the store prefix.
  const isShopPath = canonical !== undefined && /^\/(?!\/)/.test(canonical);
  const canonicalHref = canonical !== undefined && isShopPath ? storePath(canonical) : canonical;

  useEffect(() => {
    if (!canonicalHref) return;
    const link = upsert('link[rel="canonical"]', () => {
      const el = document.createElement('link');
      el.setAttribute('rel', 'canonical');
      return el;
    });
    link.setAttribute('href', canonicalHref);
    return () => link.remove();
  }, [canonicalHref]);

  // hreflang: every store view of this page plus x-default (the default store), absolute URLs as
  // the spec asks. Only for indexable shop pages; the same path in each store is a translation
  // or a currency variant of this one. (Per-locale slugs arrive with the catalogue slice.)
  const alternatesPath = isShopPath && alternates && !noindex ? canonical : undefined;
  useEffect(() => {
    if (!alternatesPath) return;
    const tail = alternatesPath === '/' ? '' : alternatesPath;
    const entries = [
      ...STORES.map((store) => ({ hreflang: store.locale, code: store.code })),
      { hreflang: 'x-default', code: DEFAULT_STORE.code },
    ];
    const added = entries.map(({ hreflang, code }) => {
      const link = document.createElement('link');
      link.setAttribute('rel', 'alternate');
      link.setAttribute('hreflang', hreflang);
      link.setAttribute('href', `${window.location.origin}/${code}${tail}`);
      document.head.appendChild(link);
      return link;
    });
    return () => added.forEach((link) => link.remove());
  }, [alternatesPath]);

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

  // Open Graph tags (what a link preview reads) only for articles: other pages keep the minimal
  // set above until a later SEO project decides what every page should carry.
  useEffect(() => {
    if (type !== 'article') return;
    const tags: [string, string | undefined][] = [
      ['og:type', 'article'],
      ['og:title', title],
      ['og:description', description],
      ['og:image', image],
      ['article:published_time', publishedAt],
    ];
    const added: HTMLElement[] = [];
    for (const [property, content] of tags) {
      if (!content) continue;
      const meta = document.createElement('meta');
      meta.setAttribute('property', property);
      meta.setAttribute('content', content);
      document.head.appendChild(meta);
      added.push(meta);
    }
    return () => added.forEach((el) => el.remove());
  }, [type, title, description, image, publishedAt]);

  // Serialised first so the effect depends on a string, not on an object that is new every render.
  const jsonText = jsonLd ? JSON.stringify(jsonLd) : null;
  useEffect(() => {
    if (!jsonText) return;
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.dataset.seo = 'json-ld';
    // textContent, never innerHTML: the JSON is data, and a "</script>" inside an answer must not
    // be able to end the element (JSON.stringify leaves "<" alone, and textContent is not parsed).
    script.textContent = jsonText;
    document.head.appendChild(script);
    return () => script.remove();
  }, [jsonText]);

  return null;
}
