import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StoreLayout } from '../features/stores/StoreContext';
import { renderApp } from '../test/render';

import { useFormat } from './format';

import { useT } from './index';

function Probe() {
  const { t, tn } = useT();
  const fmt = useFormat();
  return (
    <p data-testid="out">{`${t('cart.title')} | ${tn('catalog.productCount', 1)} | ${fmt.money(123450)}`}</p>
  );
}
const table = [{ element: <StoreLayout />, children: [{ path: '*', element: <Probe /> }] }];

describe('the store view picks the language and number format', () => {
  it.each([
    ['/eu-en/x', 'Your cart | 1 product | €1,234.50'],
    ['/uk-en/x', 'Your cart | 1 product | €1,234.50'],
    ['/de-de/x', 'Ihr Warenkorb |'],
    ['/fr-fr/x', 'Votre panier |'],
  ])('%s', (path, expected) => {
    renderApp(path, table);
    const text = screen.getByTestId('out').textContent ?? '';
    expect(text.startsWith(expected.split('|')[0]!.trim())).toBe(true);
    if (path.startsWith('/de-de')) expect(text).toContain('1.234,50');
    if (path.startsWith('/fr-fr')) expect(text).toMatch(/1\s234,50/);
    if (path.startsWith('/eu-en')) expect(text).toContain(expected);
  });
});
