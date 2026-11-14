import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { makePoints } from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { API, server, signedInAs } from '../../test/server';

const reward = (over: object = {}) => ({
  id: 'r1',
  name: '5 euro voucher',
  description: 'Five euros off',
  costPoints: 500,
  kind: 'coupon_fixed',
  valueCents: 500,
  ...over,
});

function serve(opts: { balance: number; rewards?: object[]; codes?: object[] }) {
  server.use(
    signedInAs(),
    http.get(`${API}/me/points`, () =>
      HttpResponse.json({
        data: makePoints({
          balance: opts.balance,
          lifetimeEarned: opts.balance,
          entries: [
            {
              id: 'e1',
              delta: opts.balance,
              kind: 'earn',
              orderNumber: 'PW-2026-000001',
              reason: null,
              createdAt: '2026-11-10T10:00:00.000Z',
            },
          ],
        }),
      }),
    ),
    http.get(`${API}/rewards`, () =>
      HttpResponse.json({
        data: opts.rewards ?? [
          reward(),
          reward({ id: 'r2', name: 'Free delivery', costPoints: 300 }),
        ],
      }),
    ),
    http.get(`${API}/me/codes`, () => HttpResponse.json({ data: opts.codes ?? [] })),
  );
}

describe('/account/rewards', () => {
  it('shows balance, tier, the ledger and the rewards', async () => {
    serve({ balance: 400 });
    renderApp('/account/rewards');
    expect(await screen.findByTestId('points-balance')).toHaveTextContent('400');
    expect(screen.getByTestId('points-tier')).toHaveTextContent('Pup');
    expect(screen.getByText(/100 more earned points|500 more earned points/)).toBeInTheDocument();
    expect(await screen.findAllByTestId('reward-card')).toHaveLength(2);
    expect(screen.getByTestId('points-ledger-row')).toHaveTextContent('Earned · PW-2026-000001');
  });

  it('disables a reward you cannot afford and says how many points are missing', async () => {
    serve({ balance: 400 });
    renderApp('/account/rewards');
    const cards = await screen.findAllByTestId('reward-card');
    const voucher = cards.find((c) => within(c).queryByText('5 euro voucher'))!;
    expect(within(voucher).getByRole('button')).toBeDisabled();
    expect(within(voucher).getByRole('button')).toHaveTextContent('100 more points');
    const shipping = cards.find((c) => within(c).queryByText('Free delivery'))!;
    expect(within(shipping).getByRole('button')).toBeEnabled();
  });

  it('redeems a reward and refreshes the balance and the codes', async () => {
    serve({ balance: 600 });
    let balance = 600;
    const codes: object[] = [];
    server.use(
      http.post(`${API}/me/rewards/:id/redeem`, () => {
        balance = 100;
        const code = {
          code: 'PAWS-ABCD-EFGH',
          kind: 'fixed',
          value: 500,
          minSpendCents: 0,
          endsAt: '2027-01-10T00:00:00.000Z',
          used: false,
        };
        codes.push(code);
        return HttpResponse.json({ data: { code, balance } }, { status: 201 });
      }),
      http.get(`${API}/me/points`, () =>
        HttpResponse.json({ data: makePoints({ balance, lifetimeEarned: 600 }) }),
      ),
      http.get(`${API}/me/codes`, () => HttpResponse.json({ data: codes })),
    );
    renderApp('/account/rewards');
    const cards = await screen.findAllByTestId('reward-card');
    const voucher = cards.find((c) => within(c).queryByText('5 euro voucher'))!;
    await userEvent.click(within(voucher).getByRole('button'));
    expect(await screen.findByTestId('personal-code')).toHaveTextContent('PAWS-ABCD-EFGH');
    expect(screen.getByTestId('points-balance')).toHaveTextContent('100');
  });

  it('says so when nothing can be redeemed yet', async () => {
    serve({ balance: 0, rewards: [] });
    renderApp('/account/rewards');
    expect(await screen.findByText('No rewards are available right now.')).toBeInTheDocument();
    expect(screen.getByText(/Codes you buy with points appear here/)).toBeInTheDocument();
  });
});
