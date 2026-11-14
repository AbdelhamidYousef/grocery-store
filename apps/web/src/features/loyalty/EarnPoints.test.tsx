import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { makePoints } from '../../test/fixtures';
import { renderWithProviders } from '../../test/render';
import { API, server, signedInAs } from '../../test/server';

import { EarnPoints } from './EarnPoints';

const show = (cents: number) =>
  renderWithProviders(
    <MemoryRouter>
      <EarnPoints merchandiseCents={cents} returnTo="/cart" />
    </MemoryRouter>,
  );

describe('EarnPoints', () => {
  it('asks a guest to sign in instead of promising a number', async () => {
    show(2350);
    const note = await screen.findByTestId('earn-points');
    expect(note).toHaveTextContent('Sign in to earn');
    expect(screen.getByRole('link', { name: 'Sign in to earn' })).toHaveAttribute(
      'href',
      '/login?next=%2Fcart',
    );
  });

  it('shows whole euros as points for a signed-in pup', async () => {
    server.use(signedInAs());
    show(2350);
    expect(await screen.findByText('Earn 23 points')).toBeInTheDocument();
  });

  it('uses the shopper tier rate', async () => {
    server.use(
      signedInAs(),
      http.get(`${API}/me/points`, () =>
        HttpResponse.json({
          data: makePoints({ tier: { id: 'top_dog', label: 'Top Dog', ratePercent: 150 } }),
        }),
      ),
    );
    show(10_000);
    expect(await screen.findByText('Earn 150 points')).toBeInTheDocument();
  });

  it('says nothing when there is nothing to earn', async () => {
    server.use(signedInAs());
    show(99);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('earn-points')).toBeNull();
  });
});
