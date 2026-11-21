import type { OrderItem } from '@store/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { makeCustomerOrder, makeOrder } from '../../test/fixtures';
import { renderApp, renderWithProviders } from '../../test/render';
import { API, server, signedInAs } from '../../test/server';
import { linesOfOrder } from '../checkout/OrderSummary';

import { changesOf, replacementSavingCents } from './changes';
import { OrderChanges } from './OrderChanges';

const base = makeOrder().items[0]!;
const original = (over: Partial<OrderItem> = {}): OrderItem => ({
  ...base,
  id: 'o1',
  productName: 'Greek yoghurt',
  unitPriceCents: 200,
  quantity: 3,
  lineTotalCents: 600,
  pickStatus: 'substituted',
  pickedQty: 1,
  ...over,
});
const swap = (over: Partial<OrderItem> = {}): OrderItem => ({
  ...base,
  id: 's1',
  productName: 'Natural yoghurt',
  variantName: '500 g',
  unitPriceCents: 200,
  listPriceCents: 250,
  quantity: 2,
  lineTotalCents: 400,
  pickStatus: 'picked',
  pickedQty: 2,
  substitutesItemId: 'o1',
  swapStatus: 'proposed',
  ...over,
});

describe('changes of an order', () => {
  it('pairs each short or missing line with its replacement and works out what is saved', () => {
    const items = [original(), swap(), makeOrder().items[0]!];
    const changes = changesOf(items);
    expect(changes).toHaveLength(1);
    expect(changes[0]!.replacement?.id).toBe('s1');
    // 2 units at a list price of 250 charged at 200 each: 100 saved.
    expect(replacementSavingCents(changes[0]!)).toBe(100);
    expect(
      replacementSavingCents({ original: original(), replacement: swap({ listPriceCents: 150 }) }),
    ).toBe(0);
    expect(replacementSavingCents({ original: original(), replacement: null })).toBe(0);
  });
});

describe('the order summary lines', () => {
  it('hides a rejected replacement, shows found units and what a replacement replaces', () => {
    const lines = linesOfOrder([original(), swap(), swap({ id: 's2', swapStatus: 'rejected' })]);
    expect(lines.map((l) => l.key)).toEqual(['o1', 's1']);
    expect(lines[0]).toMatchObject({ found: { picked: 1, quantity: 3 }, lineTotalCents: 200 });
    expect(lines[1]).toMatchObject({ replaces: 'Greek yoghurt', lineTotalCents: 400 });
  });
  it('a line with nothing found is not charged', () => {
    const [line] = linesOfOrder([original({ pickStatus: 'missing', pickedQty: 0 })]);
    expect(line).toMatchObject({ notCharged: true });
  });
});

describe('Changes to your order', () => {
  it('renders nothing when nothing changed', () => {
    renderWithProviders(<OrderChanges order={makeOrder()} />);
    expect(screen.queryByTestId('order-changes')).not.toBeInTheDocument();
  });

  it('says a missing item is not charged', () => {
    renderWithProviders(
      <OrderChanges
        order={makeOrder({ items: [original({ pickStatus: 'missing', pickedQty: 0 })] })}
      />,
    );
    expect(screen.getByTestId('order-change-gap')).toHaveTextContent('Not in stock.');
    expect(screen.getByTestId('order-changes')).toHaveTextContent(
      'You are not charged for what is missing.',
    );
  });

  it('shows the replacement, the saving and the buttons until the bag is closed', () => {
    renderWithProviders(<OrderChanges order={makeOrder({ items: [original(), swap()] })} />);
    const card = screen.getByTestId('order-change');
    expect(card).toHaveTextContent('We found 1 of 3. You pay for 1.');
    expect(card).toHaveTextContent('Natural yoghurt');
    expect(card).toHaveTextContent('2 x €2.00 each');
    expect(screen.getByTestId('order-change-save')).toHaveTextContent('You save €1.00');
    expect(screen.getByTestId('swap-accept')).toBeVisible();
    expect(screen.getByTestId('swap-reject')).toBeVisible();
    expect(card).toHaveTextContent('If you do not answer, we keep it when we dispatch your order.');
  });

  it('has no buttons once the order is captured, and says what happened', () => {
    const accepted = makeOrder({
      status: 'shipped',
      capturedCents: 2000,
      items: [original(), swap({ swapStatus: 'accepted' })],
    });
    const { unmount } = renderWithProviders(<OrderChanges order={accepted} />);
    expect(screen.queryByTestId('swap-accept')).not.toBeInTheDocument();
    expect(screen.getByTestId('order-change-state')).toHaveTextContent('Accepted.');
    expect(screen.getByTestId('order-change-state')).toHaveTextContent('tell the courier');
    unmount();
    renderWithProviders(
      <OrderChanges
        order={makeOrder({
          status: 'delivered',
          capturedCents: 1600,
          items: [original(), swap({ swapStatus: 'rejected', refundedCents: 400 })],
        })}
      />,
    );
    expect(screen.getByTestId('order-change-state')).toHaveTextContent(
      'Refused at the door. We refunded €4.00.',
    );
  });

  it('says rejected before dispatch means not charged', () => {
    renderWithProviders(
      <OrderChanges order={makeOrder({ items: [original(), swap({ swapStatus: 'rejected' })] })} />,
    );
    expect(screen.getByTestId('order-change-state')).toHaveTextContent(
      'Rejected. You are not charged for it.',
    );
  });
});

describe('answering on the account order page', () => {
  it('sends the answer and shows the outcome', async () => {
    let body: unknown;
    let answered = false;
    const order = () =>
      makeCustomerOrder({
        number: 'GR-2026-000123',
        items: [original(), swap({ swapStatus: answered ? 'rejected' : 'proposed' })],
      });
    server.use(
      signedInAs(),
      http.get(`${API}/account/orders/:number`, () => HttpResponse.json({ data: order() })),
      http.post(`${API}/orders/GR-2026-000123/swaps/s1`, async ({ request }) => {
        body = await request.json();
        answered = true;
        return HttpResponse.json({
          data: { orderNumber: 'GR-2026-000123', itemId: 's1', swapStatus: 'rejected' },
        });
      }),
    );
    renderApp('/account/orders/GR-2026-000123');
    await userEvent.click(await screen.findByTestId('swap-reject'));
    await waitFor(() => expect(body).toEqual({ decision: 'reject' }));
    expect(await screen.findByTestId('order-change-state')).toHaveTextContent('Rejected.');
    // The rejected replacement is gone from the item list.
    const items = screen.getAllByTestId('order-item');
    expect(within(items[0]!.parentElement!).queryByText('Natural yoghurt')).toBeNull();
  });

  it('tells the shopper when the bag has already left', async () => {
    server.use(
      signedInAs(),
      http.get(`${API}/account/orders/:number`, () =>
        HttpResponse.json({
          data: makeCustomerOrder({ number: 'GR-2026-000123', items: [original(), swap()] }),
        }),
      ),
      http.post(`${API}/orders/GR-2026-000123/swaps/s1`, () =>
        HttpResponse.json(
          { error: { code: 'CONFLICT', message: 'The bag has left' } },
          { status: 409 },
        ),
      ),
    );
    renderApp('/account/orders/GR-2026-000123');
    await userEvent.click(await screen.findByTestId('swap-accept'));
    expect(await screen.findByText(/The bag has left\. Tell the courier/)).toBeVisible();
  });
});

describe('the link in the email', () => {
  const url = '/order-changes/GR-2026-000123?item=s1&decision=reject&token=abc';

  it('changes nothing until the button is pressed, then sends the token', async () => {
    let body: unknown;
    server.use(
      http.post(`${API}/orders/GR-2026-000123/swaps/s1`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          data: { orderNumber: 'GR-2026-000123', itemId: 's1', swapStatus: 'rejected' },
        });
      }),
    );
    renderApp(url);
    expect(await screen.findByTestId('page-order-changes')).toHaveTextContent(
      'You are about to turn down the replacement.',
    );
    expect(body).toBeUndefined();
    await userEvent.click(screen.getByTestId('order-changes-confirm'));
    expect(await screen.findByTestId('order-changes-done')).toHaveTextContent(
      'Done. We take the replacement out',
    );
    expect(body).toEqual({ decision: 'reject', token: 'abc' });
  });

  it('says a dead link is dead, and a closed bag is closed', async () => {
    server.use(
      http.post(`${API}/orders/GR-2026-000123/swaps/s1`, () =>
        HttpResponse.json({ error: { code: 'NOT_FOUND', message: 'nope' } }, { status: 404 }),
      ),
    );
    renderApp(url);
    await userEvent.click(await screen.findByTestId('order-changes-confirm'));
    expect(await screen.findByText('This link does not work any more.')).toBeVisible();
  });

  it('a link without its token is a dead link', async () => {
    renderApp('/order-changes/GR-2026-000123?item=s1&decision=accept');
    expect(await screen.findByText('This link does not work any more.')).toBeVisible();
  });
});

describe('the tracking page', () => {
  it('lists what changed without any money', async () => {
    const { TrackedOrderView } = await import('../tracking/TrackedOrderView');
    renderWithProviders(
      <TrackedOrderView
        order={{
          orderNumber: 'GR-2026-000123',
          status: 'processing',
          statusLabel: 'Packing',
          placedAt: null,
          items: [],
          changes: [
            {
              name: 'Greek yoghurt',
              picked: 1,
              quantity: 3,
              replacement: { name: 'Natural yoghurt', quantity: 2, status: 'proposed' },
            },
            { name: 'Bananas', picked: 0, quantity: 2, replacement: null },
          ],
          tracking: null,
          delivery: null,
          fulfilment: null,
          timeline: [],
        }}
      />,
    );
    const box = screen.getByTestId('track-changes');
    expect(box).toHaveTextContent('Greek yoghurt We found 1 of 3. You pay for 1.');
    expect(box).toHaveTextContent('Replacement: 2 x Natural yoghurt (waiting for your answer).');
    expect(box).toHaveTextContent('Bananas Not in stock. You are not charged for what is missing.');
    expect(box.textContent).not.toMatch(/€/);
  });
});
