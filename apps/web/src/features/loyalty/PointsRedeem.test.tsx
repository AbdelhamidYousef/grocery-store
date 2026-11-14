import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { makePoints } from '../../test/fixtures';
import { renderWithProviders } from '../../test/render';
import { API, server, signedInAs } from '../../test/server';

import { PointsRedeem } from './PointsRedeem';

function Harness({ merchandiseCents }: { merchandiseCents: number }) {
  const [value, setValue] = useState(0);
  return (
    <>
      <PointsRedeem
        merchandiseCents={merchandiseCents}
        currency="EUR"
        value={value}
        onChange={setValue}
      />
      <output data-testid="chosen">{value}</output>
    </>
  );
}

const balance = (n: number) =>
  server.use(
    signedInAs(),
    http.get(`${API}/me/points`, () => HttpResponse.json({ data: makePoints({ balance: n }) })),
  );

describe('PointsRedeem', () => {
  it('renders nothing when there are no points', async () => {
    server.use(signedInAs());
    renderWithProviders(<Harness merchandiseCents={2000} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('points-redeem')).toBeNull();
  });

  it('"use max" takes the balance when it is below the merchandise', async () => {
    balance(500);
    renderWithProviders(<Harness merchandiseCents={2000} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Use max (500)' }));
    expect(screen.getByTestId('chosen')).toHaveTextContent('500');
    expect(screen.getByTestId('points-applied')).toHaveTextContent('500 points = €5.00 off');
  });

  it('caps what is typed at the merchandise total, and Clear resets it', async () => {
    balance(5000);
    renderWithProviders(<Harness merchandiseCents={1200} />);
    const input = await screen.findByLabelText('Use loyalty points');
    await userEvent.type(input, '4000');
    expect(screen.getByTestId('chosen')).toHaveTextContent('1200');
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByTestId('chosen')).toHaveTextContent('0');
  });
});
