import { act, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TestProviders } from '../../../test/render';
import { API, server } from '../../../test/server';

import { DeliveryEstimate, describeEstimates, pickMethods } from './DeliveryEstimate';

const express = { code: 'express', name: 'Express delivery', etaDaysMin: 1, etaDaysMax: 2 };
const standard = { code: 'standard', name: 'Standard delivery', etaDaysMin: 3, etaDaysMax: 5 };

afterEach(() => vi.useRealTimers());

function serveMethods(serverNow: string, methods = [express, standard]) {
  server.use(
    http.get(`${API}/delivery-methods`, () => HttpResponse.json({ data: { serverNow, methods } })),
  );
}

async function renderEstimate() {
  render(
    <TestProviders>
      <DeliveryEstimate />
    </TestProviders>,
  );
  return screen.findByTestId('delivery-estimate');
}

describe('pickMethods', () => {
  it('shows standard first, then the fastest when it is a different method', () => {
    expect(pickMethods([express, standard]).map((m) => m.code)).toEqual(['standard', 'express']);
  });
  it('shows one line when there is one method, or when standard is also the fastest', () => {
    expect(pickMethods([standard]).map((m) => m.code)).toEqual(['standard']);
    expect(pickMethods([])).toEqual([]);
    expect(pickMethods([{ ...standard, code: 'only', name: 'Only' }]).map((m) => m.code)).toEqual([
      'only',
    ]);
  });
});

describe('describeEstimates', () => {
  const estimate = {
    dispatchDate: '2026-11-04',
    arrivesFrom: '2026-11-09',
    arrivesTo: '2026-11-11',
    dispatchesToday: true,
    msToCutoff: 4 * 3_600_000 + 20 * 60_000,
    cutoffLabel: 'Cutoff 15:00 CET',
  };

  it('writes the countdown and the arrival range, and a static sentence without any countdown', () => {
    const out = describeEstimates([
      { method: standard, estimate },
      {
        method: express,
        estimate: { ...estimate, arrivesFrom: '2026-11-05', arrivesTo: '2026-11-06' },
      },
    ]);
    expect(out?.visible).toEqual([
      'Order in 4h 20m, arrives Mon 9 Nov to Wed 11 Nov',
      'Express delivery arrives Thu 5 Nov to Fri 6 Nov',
    ]);
    expect(out?.spoken).toBe(
      'Order before 15:00 CET on a business day and it ships the same day. Standard delivery arrives Mon 9 Nov to Wed 11 Nov. Express delivery arrives Thu 5 Nov to Fri 6 Nov.',
    );
    expect(out?.spoken).not.toMatch(/\d+h|\d+m\b/);
  });

  it('says when the order ships instead of counting down after the cutoff, and shows one date when the range is one day', () => {
    const out = describeEstimates([
      {
        method: express,
        estimate: {
          ...estimate,
          dispatchesToday: false,
          msToCutoff: null,
          dispatchDate: '2026-11-09',
          arrivesFrom: '2026-11-10',
          arrivesTo: '2026-11-10',
        },
      },
    ]);
    expect(out?.visible[0]).toBe('Order now, ships Mon 9 Nov, arrives Tue 10 Nov');
  });

  it('is null with nothing to estimate', () => {
    expect(describeEstimates([])).toBeNull();
  });
});

describe('DeliveryEstimate', () => {
  it('counts down to the cutoff in the store zone and names the zone', async () => {
    // Wed 4 Nov 2026, 10:40 in Amsterdam (09:40Z).
    vi.useFakeTimers({
      toFake: ['Date', 'setInterval', 'clearInterval'],
      now: new Date('2026-11-04T09:40:00Z'),
    });
    serveMethods('2026-11-04T09:40:00.000Z');
    const box = await renderEstimate();
    expect(box).toHaveTextContent('Order in 4h 20m, arrives Mon 9 Nov to Wed 11 Nov');
    expect(box).toHaveTextContent('Express delivery arrives Thu 5 Nov to Fri 6 Nov');
    expect(box).toHaveTextContent('Cutoff 15:00 CET, Amsterdam time, Monday to Friday.');
  });

  it('uses the server clock when the device clock is wrong', async () => {
    // The device thinks it is two hours earlier; the server says 09:40Z.
    vi.useFakeTimers({
      toFake: ['Date', 'setInterval', 'clearInterval'],
      now: new Date('2026-11-04T07:40:00Z'),
    });
    serveMethods('2026-11-04T09:40:00.000Z');
    const box = await renderEstimate();
    expect(box).toHaveTextContent('Order in 4h 20m');
  });

  it('ticks once a minute, and stays quiet for screen readers', async () => {
    vi.useFakeTimers({
      toFake: ['Date', 'setInterval', 'clearInterval'],
      now: new Date('2026-11-04T09:40:00Z'),
    });
    serveMethods('2026-11-04T09:40:00.000Z');
    const box = await renderEstimate();
    expect(box).toHaveAttribute('aria-live', 'off');
    const visible = box.querySelector('p');
    expect(visible).toHaveAttribute('aria-hidden', 'true');
    expect(box.querySelector('.sr-only')?.textContent).not.toMatch(/\dh \dm/);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(box).toHaveTextContent('Order in 4h 19m');
    act(() => {
      vi.advanceTimersByTime(60_000 * 19);
    });
    expect(box).toHaveTextContent('Order in 4h 0m');
  });

  it('switches from the countdown to a ship date once the cutoff passes', async () => {
    // Wed 4 Nov 2026, 14:59 Amsterdam, one minute before the cutoff.
    vi.useFakeTimers({
      toFake: ['Date', 'setInterval', 'clearInterval'],
      now: new Date('2026-11-04T13:59:00Z'),
    });
    serveMethods('2026-11-04T13:59:00.000Z');
    const box = await renderEstimate();
    expect(box).toHaveTextContent('Order in 1m');
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(box).toHaveTextContent('Order now, ships Thu 5 Nov');
  });

  it('renders nothing when the shop has no shipping methods', async () => {
    serveMethods('2026-11-04T09:40:00.000Z', []);
    render(
      <TestProviders>
        <DeliveryEstimate />
      </TestProviders>,
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('delivery-estimate')).toBeNull();
  });
});
