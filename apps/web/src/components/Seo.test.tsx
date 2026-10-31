import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Seo } from './Seo';

describe('Seo', () => {
  it('sets title, description, canonical and robots, and removes them on unmount', () => {
    document.title = 'Before';
    const { unmount } = render(
      <Seo title="Dogs" description="Dog stuff" canonical="https://x.test/c/dogs" noindex />,
    );
    expect(document.title).toBe('Dogs | Pawsome');
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
    render(<Seo title="Pawsome" />);
    expect(document.title).toBe('Pawsome');
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });
});
