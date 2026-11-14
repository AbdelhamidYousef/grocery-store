import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '../../components/ui/Toast';
import { createQueryClient } from '../../lib/query-client';
import { makeCart, makeCartItem } from '../../test/fixtures';

import { AgentToolsBridge } from './AgentToolsBridge';

const api = vi.hoisted(() => ({ addCartItem: vi.fn(), fetchCart: vi.fn() }));
vi.mock('../../api/cart', () => api);

const VARIANT = '2f6d3a52-5b2c-4d57-9a41-0d6f1f0f7a10';

function setup() {
  const tools = new Map<string, ModelContextTool>();
  Object.defineProperty(document, 'modelContext', {
    configurable: true,
    value: { registerTool: (t: ModelContextTool) => void tools.set(t.name, t) },
  });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <ToastProvider>
        <AgentToolsBridge />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return tools;
}

afterEach(() => {
  Reflect.deleteProperty(document, 'modelContext');
  vi.resetAllMocks();
});

describe('AgentToolsBridge', () => {
  it('shows a visible toast when an agent adds to the cart', async () => {
    api.addCartItem.mockResolvedValue(makeCart([makeCartItem({ variantId: VARIANT })]));
    const tools = setup();
    await tools.get('add_to_cart')!.execute({ variantId: VARIANT, quantity: 1 });
    expect(await screen.findByText('Assistant added Rope Tug to your cart')).toBeInTheDocument();
  });

  it('shows no toast for a read or a failed call', async () => {
    api.fetchCart.mockResolvedValue(makeCart());
    const tools = setup();
    await tools.get('get_cart')!.execute({});
    await tools.get('add_to_cart')!.execute({ variantId: 'bad', quantity: 1 });
    expect(screen.queryByTestId('toast')).not.toBeInTheDocument();
  });

  it('refuses the 31st call within a minute with RATE_LIMITED', async () => {
    api.fetchCart.mockResolvedValue(makeCart());
    const tools = setup();
    const get = tools.get('get_cart')!;
    for (let i = 0; i < 30; i++) await get.execute({});
    expect(await get.execute({})).toMatchObject({ error: { code: 'RATE_LIMITED' } });
    expect(api.fetchCart).toHaveBeenCalledTimes(30);
  });
});
