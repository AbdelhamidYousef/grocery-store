import { useQuery, useQueryClient } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { POSTCODE_KEY, readPostcode, resetPostcodeMemory } from '../../lib/postcode';
import { makeCard } from '../../test/fixtures';
import { renderApp, renderWithProviders } from '../../test/render';
import { API, server } from '../../test/server';
import { ProductCard } from '../catalog/ProductCard';

import { DeliveryProvider, useDelivery } from './DeliveryContext';

// A probe that shows what the context holds and fetches a catalogue-like query, counting how many
// times the API was asked.
function Probe({ onFetch }: { onFetch: () => void }) {
  const d = useDelivery();
  useQuery({
    queryKey: ['products', 'probe'],
    queryFn: () => {
      onFetch();
      return Promise.resolve(1);
    },
  });
  const client = useQueryClient();
  return (
    <div>
      <p data-testid="state">
        {JSON.stringify({
          postcode: d.postcode,
          served: d.served,
          area: d.area?.name ?? null,
          store: d.store?.name ?? null,
          status: d.status,
        })}
      </p>
      <button onClick={() => d.setPostcode('12045')}>to-neukoelln</button>
      <button onClick={() => d.clear()}>clear</button>
      <span data-testid="cache">{client.getQueryCache().getAll().length}</span>
    </div>
  );
}

const state = () =>
  JSON.parse(screen.getByTestId('state').textContent ?? '{}') as {
    postcode: string | null;
    served: boolean;
    area: string | null;
    store: string | null;
    status: string;
  };

const mount = (url: string, onFetch: () => void = () => undefined) =>
  renderWithProviders(
    <MemoryRouter initialEntries={[url]}>
      <DeliveryProvider>
        <Probe onFetch={onFetch} />
      </DeliveryProvider>
    </MemoryRouter>,
  );

describe('DeliveryContext', () => {
  it('has nothing chosen at first', () => {
    mount('/');
    expect(state()).toMatchObject({ postcode: null, served: false, status: 'none' });
  });

  it('reads ?postcode= and asks the API what it means', async () => {
    mount('/?postcode=10115');
    expect(state().postcode).toBe('10115');
    await waitFor(() =>
      expect(state()).toMatchObject({
        served: true,
        area: 'Mitte',
        store: 'Grocery Mitte',
        status: 'ready',
      }),
    );
  });

  it('remembers the postcode and falls back to it when the URL has none', async () => {
    mount('/?postcode=12043');
    await waitFor(() => expect(state().served).toBe(true));
    expect(window.localStorage.getItem(POSTCODE_KEY)).toBe('12043');

    document.body.innerHTML = '';
    resetPostcodeMemory(); // as after a reload: only localStorage is left
    mount('/');
    expect(state().postcode).toBe('12043');
  });

  it('lets the URL win over what was remembered', async () => {
    window.localStorage.setItem(POSTCODE_KEY, '10115');
    mount('/?postcode=12045');
    expect(state().postcode).toBe('12045');
    await waitFor(() => expect(state().area).toBe('Neukölln'));
    expect(readPostcode()).toBe('12045');
  });

  it('ignores a malformed ?postcode=', () => {
    mount('/?postcode=abc');
    expect(state().postcode).toBeNull();
  });

  it('keeps a postcode we do not deliver to, flagged as not served', async () => {
    mount('/?postcode=80331');
    await waitFor(() => expect(state().status).toBe('ready'));
    expect(state()).toMatchObject({ postcode: '80331', served: false, area: null, store: null });
  });

  it('reports a failed lookup as an error, not as "not served"', async () => {
    server.use(
      http.get(`${API}/delivery/postcodes/:code`, () =>
        HttpResponse.json({ error: { code: 'INTERNAL', message: 'boom' } }, { status: 500 }),
      ),
    );
    mount('/?postcode=10115');
    await waitFor(() => expect(state().status).toBe('error'), { timeout: 10_000 });
    expect(state().served).toBe(false);
  });

  it('sends X-Postcode on API calls once a postcode is chosen', async () => {
    const seen: (string | null)[] = [];
    server.use(
      http.get(`${API}/delivery/areas`, ({ request }) => {
        seen.push(request.headers.get('x-postcode'));
        return HttpResponse.json({ data: [] });
      }),
    );
    const { fetchDeliveryAreas } = await import('../../api/delivery');
    await fetchDeliveryAreas();
    mount('/?postcode=12045');
    await fetchDeliveryAreas();
    expect(seen).toEqual([null, '12045']);
  });

  it('refetches the catalogue queries when the postcode changes, not the lookups', async () => {
    let fetches = 0;
    mount('/?postcode=10115', () => (fetches += 1));
    await waitFor(() => expect(fetches).toBe(1));
    await waitFor(() => expect(state().served).toBe(true));
    await userEvent.click(screen.getByText('to-neukoelln'));
    await waitFor(() => expect(fetches).toBe(2));
    expect(state().postcode).toBe('12045');
    await userEvent.click(screen.getByText('clear'));
    await waitFor(() => expect(fetches).toBe(3));
    expect(state()).toMatchObject({ postcode: null, status: 'none' });
    expect(window.localStorage.getItem(POSTCODE_KEY)).toBeNull();
  });
});

describe('the header chip', () => {
  it('asks for a postcode, then shows the one that is set', async () => {
    renderApp('/help');
    const chip = await screen.findByTestId('delivery-chip');
    expect(chip).toHaveTextContent('Enter postcode');
    renderApp('/help?postcode=10115');
    await waitFor(() =>
      expect(screen.getAllByTestId('delivery-chip').at(-1)).toHaveTextContent('Deliver to 10115'),
    );
  });

  it('opens a dialog, takes a postcode and shows the area', async () => {
    const user = userEvent.setup();
    renderApp('/help');
    await user.click(await screen.findByTestId('delivery-chip'));
    const form = within(await screen.findByTestId('delivery-dialog-form'));
    await user.type(form.getByLabelText('Your postcode'), '1204');
    await user.click(form.getByRole('button', { name: 'Check delivery' }));
    expect(await form.findByText('Enter a 5-digit postcode')).toBeInTheDocument();
    await user.type(form.getByLabelText('Your postcode'), '5');
    await user.click(form.getByRole('button', { name: 'Check delivery' }));
    expect(await screen.findByTestId('delivery-dialog-result')).toHaveTextContent(
      'We deliver to 12045 · Neukölln',
    );
    expect(screen.getByTestId('delivery-chip')).toHaveTextContent('Deliver to 12045');
  });

  it('says so, and lists the areas, for a postcode we do not deliver to', async () => {
    const user = userEvent.setup();
    renderApp('/help?postcode=80331');
    const chip = await screen.findByTestId('delivery-chip');
    await waitFor(() => expect(chip).toHaveTextContent('No delivery to 80331'));
    await user.click(chip);
    const result = await screen.findByTestId('delivery-dialog-result');
    expect(result).toHaveTextContent("We don't deliver to 80331 yet.");
    await waitFor(() =>
      expect(
        within(within(result).getByTestId('delivery-areas-list')).getAllByRole('listitem'),
      ).toHaveLength(2),
    );
  });

  it('removes the postcode again', async () => {
    const user = userEvent.setup();
    renderApp('/help?postcode=10115');
    await user.click(await screen.findByTestId('delivery-chip'));
    await user.click(await screen.findByRole('button', { name: 'Remove postcode' }));
    await waitFor(() =>
      expect(screen.getByTestId('delivery-chip')).toHaveTextContent('Enter postcode'),
    );
  });

  it('speaks German in the German store', async () => {
    renderApp('/de-de/help?postcode=12045');
    await waitFor(() =>
      expect(screen.getByTestId('delivery-chip')).toHaveTextContent('Lieferung an 12045'),
    );
  });
});

describe('the home hero result', () => {
  it('shows "We deliver to 10115 · Mitte" and the store', async () => {
    renderApp('/?postcode=10115');
    const hero = within(await screen.findByTestId('home-hero'));
    expect(await hero.findByText('We deliver to 10115 · Mitte')).toBeInTheDocument();
    expect(hero.getByText('Your order is packed at Grocery Mitte.')).toBeInTheDocument();
  });

  it('shows "We don\'t deliver to 12345 yet" with the areas', async () => {
    renderApp('/?postcode=12345');
    const hero = within(await screen.findByTestId('home-hero'));
    expect(await hero.findByText("We don't deliver to 12345 yet.")).toBeInTheDocument();
    expect(await hero.findByText('Neukölln')).toBeInTheDocument();
    expect(hero.getByRole('link', { name: 'See where we deliver' })).toHaveAttribute(
      'href',
      '/delivery',
    );
  });
});

describe('availability follows the store', () => {
  const card = makeCard({ inStock: false });
  const inStore = (url: string) =>
    renderWithProviders(
      <MemoryRouter initialEntries={[url]}>
        <DeliveryProvider>
          <ProductCard product={card} />
        </DeliveryProvider>
      </MemoryRouter>,
    );

  it('says "Sold out" with no postcode', () => {
    inStore('/');
    expect(screen.getByTestId('sold-out-badge')).toHaveTextContent(/^Sold out$/);
  });

  it('says where it is sold out once the store is known', async () => {
    inStore('/?postcode=12045');
    await waitFor(() =>
      expect(screen.getByTestId('sold-out-badge')).toHaveTextContent('Sold out at Neukölln'),
    );
  });
});

describe('the /delivery page', () => {
  it("lists every area with its store and postcodes, and marks the shopper's own", async () => {
    renderApp('/delivery?postcode=12045');
    const areas = await screen.findAllByTestId('delivery-area');
    expect(areas).toHaveLength(2);
    expect(areas[0]).toHaveTextContent('Mitte');
    expect(areas[0]).toHaveTextContent('Packed at Grocery Mitte, Brunnenstraße 14, 10119 Berlin');
    expect(areas[0]).toHaveTextContent('10115, 10117');
    await waitFor(() => expect(areas[1]).toHaveTextContent('Your postcode is here'));
    expect(areas[0]).not.toHaveTextContent('Your postcode is here');
  });

  it('states the basket rules with the numbers of the shared rules', async () => {
    renderApp('/delivery');
    const rules = within(await screen.findByTestId('basket-rules'));
    expect(rules.getByText(/Minimum order: €15\.00 of goods/)).toBeVisible();
    expect(
      rules.getByText(/one-hour slot: €2\.99.*17:00 and 20:00 cost €1\.00 more/),
    ).toBeVisible();
    expect(rules.getByText(/Free delivery for a slot from €49\.00 of goods/)).toBeVisible();
    expect(
      rules.getByText(/Express, within 30 minutes: €4\.99\. Express is never free/),
    ).toBeVisible();
    expect(rules.getByText(/Neukölln pays €0\.50 more/)).toBeVisible();
    expect(rules.getByText(/Paper bags: €0\.25 each, one for every 8 items/)).toBeVisible();
    expect(rules.getByText(/Bottle deposit: €0\.25 or €0\.08 a bottle/)).toBeVisible();
  });

  it('is linked from the footer', async () => {
    renderApp('/help');
    const footer = within(await screen.findByRole('contentinfo'));
    expect(footer.getByRole('link', { name: 'Where we deliver' })).toHaveAttribute(
      'href',
      '/delivery',
    );
  });
});
