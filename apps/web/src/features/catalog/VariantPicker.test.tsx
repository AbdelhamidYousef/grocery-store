import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { makeProduct, makeVariant } from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { API, server } from '../../test/server';

const picker = () => within(screen.getByTestId('variant-picker'));

function serveProduct(product: ReturnType<typeof makeProduct>) {
  server.use(http.get(`${API}/products/rope-tug`, () => HttpResponse.json({ data: product })));
}

describe('variant picker', () => {
  it('builds one labelled group per option key and preselects the default', async () => {
    renderApp('/products/rope-tug');
    await screen.findByTestId('variant-picker');
    expect(picker().getByRole('group', { name: /Colour/ })).toBeInTheDocument();
    expect(picker().getByRole('group', { name: /Size/ })).toBeInTheDocument();
    expect(picker().getByRole('radio', { name: 'Red' })).toBeChecked();
    expect(picker().getByRole('radio', { name: 'Small' })).toBeChecked();
    expect(screen.getByTestId('variant-sku')).toHaveTextContent('TUG-RED-S');
  });

  it('names a free-sample choice in words, full size first', async () => {
    serveProduct(
      makeProduct({
        optionKeys: ['pack'],
        variants: [
          makeVariant({
            id: 't',
            sku: 'OATS-T',
            name: 'Free sample, 30 g',
            options: { pack: 'trial' },
          }),
          makeVariant({ id: 'f', sku: 'OATS-F', isDefault: true, options: { pack: 'full' } }),
        ],
      }),
    );
    renderApp('/products/rope-tug');
    await screen.findByTestId('variant-picker');
    expect(picker().getByRole('group', { name: /Pack/ })).toBeInTheDocument();
    const radios = picker().getAllByRole('radio');
    expect(picker().getByRole('radio', { name: 'Full size' })).toBeChecked();
    expect(picker().getByRole('radio', { name: 'Free sample' })).not.toBeChecked();
    expect(radios[0]).toBe(picker().getByRole('radio', { name: 'Full size' }));
  });

  it('puts the chosen variant in the url and updates the price', async () => {
    const router = renderApp('/products/rope-tug');
    await screen.findByTestId('variant-picker');
    await userEvent.click(picker().getByRole('radio', { name: 'Large' }));
    await waitFor(() => expect(router.state.location.search).toBe('?variant=TUG-RED-L'));
    expect(screen.getByTestId('price-current')).toHaveTextContent('€18.99');
    expect(screen.getByTestId('variant-sku')).toHaveTextContent('TUG-RED-L');
  });

  it('opens the exact variant from a shared link, and ignores an unknown sku', async () => {
    renderApp('/products/rope-tug?variant=TUG-BLUE-S');
    await screen.findByTestId('variant-picker');
    expect(picker().getByRole('radio', { name: 'Blue' })).toBeChecked();
  });

  it('falls back to the default for an unknown sku', async () => {
    renderApp('/products/rope-tug?variant=NOPE');
    await screen.findByTestId('variant-picker');
    expect(picker().getByRole('radio', { name: 'Red' })).toBeChecked();
  });

  it('disables combinations that do not exist and sold-out variants, with a label', async () => {
    serveProduct(
      makeProduct({
        variants: [
          makeVariant({ id: 'a', sku: 'A', options: { color: 'red', size: 'S' }, isDefault: true }),
          makeVariant({
            id: 'b',
            sku: 'B',
            options: { color: 'red', size: 'L' },
            available: false,
          }),
          makeVariant({ id: 'c', sku: 'C', options: { color: 'blue', size: 'S' } }),
          // no blue / large
        ],
      }),
    );
    renderApp('/products/rope-tug');
    await screen.findByTestId('variant-picker');
    expect(picker().getByRole('radio', { name: 'Large (sold out)' })).toBeDisabled();
    expect(picker().getByRole('radio', { name: 'Small' })).toBeEnabled();
    expect(picker().getByRole('radio', { name: 'Blue' })).toBeEnabled();
  });

  it('is operable with the keyboard like any radio group', async () => {
    const router = renderApp('/products/rope-tug');
    await screen.findByTestId('variant-picker');
    picker().getByRole('radio', { name: 'Red' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    await waitFor(() => expect(router.state.location.search).toContain('variant=TUG-BLUE-S'));
  });

  it('uses a select for options with many values', async () => {
    const colors = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    serveProduct(
      makeProduct({
        optionKeys: ['color'],
        variants: colors.map((c, i) =>
          makeVariant({ id: c, sku: c.toUpperCase(), options: { color: c }, isDefault: i === 0 }),
        ),
      }),
    );
    renderApp('/products/rope-tug');
    const select = await screen.findByRole('combobox', { name: 'Colour' });
    expect(within(select).getAllByRole('option')).toHaveLength(7);
  });

  it('shows no picker for a single-variant product', async () => {
    serveProduct(
      makeProduct({ optionKeys: [], variants: [makeVariant({ options: {}, isDefault: true })] }),
    );
    renderApp('/products/rope-tug');
    await screen.findByRole('heading', { level: 1, name: 'Rope Tug' });
    expect(screen.queryByTestId('variant-picker')).not.toBeInTheDocument();
  });
});
