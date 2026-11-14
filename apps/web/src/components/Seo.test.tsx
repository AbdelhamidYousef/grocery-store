import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StoreLayout } from '../features/stores/StoreContext';
import { renderApp } from '../test/render';

import { Seo } from './Seo';

describe('Seo', () => {
  it('sets title, description, canonical and robots, and removes them on unmount', () => {
    document.title = 'Before';
    const { unmount } = render(
      <Seo title="Dogs" description="Dog stuff" canonical="https://x.test/c/dogs" noindex />,
    );
    expect(document.title).toBe('Dogs | Grocery');
    expect(document.head.querySelector('meta[name="description"]')).toHaveAttribute(
      'content',
      'Dog stuff',
    );
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://x.test/c/dogs',
    );
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex',
    );
    unmount();
    expect(document.title).toBe('Before');
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });

  it('does not add a robots tag unless asked', () => {
    render(<Seo title="Grocery" />);
    expect(document.title).toBe('Grocery');
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });

  it('writes JSON-LD as one script, replaces it when the data changes and removes it on unmount', () => {
    const { rerender, unmount } = render(
      <Seo title="P" jsonLd={{ '@type': 'FAQPage', name: 'a</script><b>' }} />,
    );
    const script = () => document.head.querySelectorAll('script[type="application/ld+json"]');
    expect(script()).toHaveLength(1);
    // The text is data: a closing script tag inside it is not parsed as markup.
    expect(JSON.parse(script()[0]?.textContent ?? '')).toEqual({
      '@type': 'FAQPage',
      name: 'a</script><b>',
    });
    rerender(<Seo title="P" jsonLd={{ '@type': 'FAQPage', name: 'b' }} />);
    expect(script()).toHaveLength(1);
    expect(script()[0]?.textContent).toContain('"b"');
    unmount();
    expect(script()).toHaveLength(0);
  });
});

describe('Seo alternates', () => {
  it('adds the store prefix to a root-relative canonical and hreflang links for every store', () => {
    const { unmount } = render(<Seo title="Dogs" canonical="/c/dogs?page=2" />);
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute(
      'href',
      '/c/dogs?page=2',
    );
    const alternates = [...document.head.querySelectorAll('link[rel="alternate"][hreflang]')];
    expect(alternates.map((l) => l.getAttribute('hreflang'))).toEqual([
      'en-IE',
      'de-DE',
      'x-default',
    ]);
    expect(
      alternates.map(
        (l) => new URL(l.getAttribute('href')!).pathname + new URL(l.getAttribute('href')!).search,
      ),
    ).toEqual(['/de-en/c/dogs?page=2', '/de-de/c/dogs?page=2', '/de-en/c/dogs?page=2']);
    unmount();
    expect(document.head.querySelector('link[rel="alternate"][hreflang]')).toBeNull();
  });

  it('skips alternates for noindex pages, absolute canonicals and alternates={false}', () => {
    const { unmount } = render(
      <>
        <Seo title="A" canonical="/cart" noindex />
        <Seo title="B" canonical="https://x.test/c/dogs" />
        <Seo title="C" canonical="/only-here" alternates={false} />
      </>,
    );
    expect(document.head.querySelector('link[rel="alternate"][hreflang]')).toBeNull();
    unmount();
  });

  it('prefixes the canonical with the current store and uses the root for "/"', () => {
    renderApp('/de-de', [
      {
        element: <StoreLayout />,
        children: [{ path: '*', element: <Seo title="Home" canonical="/" /> }],
      },
    ]);
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute('href', '/de-de');
    const hrefs = [...document.head.querySelectorAll('link[rel="alternate"]')].map(
      (l) => new URL(l.getAttribute('href')!).pathname,
    );
    expect(hrefs).toEqual(['/de-en', '/de-de', '/de-en']);
  });
});
