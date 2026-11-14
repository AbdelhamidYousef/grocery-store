import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { makePoints } from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { API, server, signedInAs } from '../../test/server';

import { clearReferral, readReferral } from './referral-cookie';

function serve(over: object = {}) {
  server.use(
    signedInAs(),
    http.get(`${API}/me/points`, () => HttpResponse.json({ data: makePoints() })),
    http.get(`${API}/rewards`, () => HttpResponse.json({ data: [] })),
    http.get(`${API}/me/codes`, () => HttpResponse.json({ data: [] })),
    http.get(`${API}/me/referral`, () =>
      HttpResponse.json({
        data: {
          code: 'PAWK7QM2',
          rewardCents: 500,
          minOrderCents: 2000,
          codeDays: 90,
          maxPerYear: 10,
          pending: 2,
          qualified: 1,
          rejected: 0,
          ...over,
        },
      }),
    ),
  );
}

describe('refer a friend', () => {
  it('shows the link, the rules from the server and the counts', async () => {
    serve();
    renderApp('/account/rewards');
    const panel = await screen.findByTestId('referral-panel');
    expect(await screen.findByTestId('referral-link')).toHaveTextContent('/?ref=PAWK7QM2');
    expect(panel).toHaveTextContent('€5.00 code');
    expect(panel).toHaveTextContent('€20.00 or more');
    expect(panel).toHaveTextContent('1 rewarded, 2 waiting for a first order');
    expect(panel).not.toHaveTextContent('not eligible');
  });

  it('mentions friends who were not eligible only when there are some', async () => {
    serve({ rejected: 3 });
    renderApp('/account/rewards');
    expect(await screen.findByTestId('referral-panel')).toHaveTextContent('3 not eligible');
  });

  it('copies the link', async () => {
    serve();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderApp('/account/rewards');
    await userEvent.click(await screen.findByRole('button', { name: 'Copy link' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/?ref=PAWK7QM2'));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });
});

describe('arriving with a referral link', () => {
  it('remembers the code from any landing page', async () => {
    clearReferral();
    renderApp('/help?ref=pawk7qm2');
    await screen.findByTestId('main');
    expect(readReferral()).toBe('PAWK7QM2');
    clearReferral();
  });
});
