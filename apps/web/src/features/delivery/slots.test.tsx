import { act, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { lookupFor } from '../../i18n';
import { makeHeldDelivery, makeSlotsData } from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { API, server } from '../../test/server';

import { HoldCountdown } from './HoldCountdown';
import { dayTabLabel, deliverySentence, firstOpenSlot, windowLabel } from './slots';

afterEach(() => {
  vi.useRealTimers();
});

const en = lookupFor('en-IE');
const de = lookupFor('de-DE');

describe('delivery words', () => {
  it('writes an absolute window in the shop zone, in the store language', () => {
    // 13:00Z is 14:00 in Berlin in winter.
    const from = '2026-11-23T13:00:00.000Z';
    const to = '2026-11-23T14:00:00.000Z';
    expect(windowLabel(from, to, 'en-IE')).toMatch(/^Mon.*23.*Nov 14:00–15:00$/);
    expect(windowLabel(from, to, 'de-DE')).toMatch(/^Mo.*23.*Nov.* 14:00–15:00$/);
  });

  it('says what an order was promised: a window or express by a time', () => {
    const slot = { kind: 'slot', from: '2026-11-23T13:00:00.000Z', to: '2026-11-23T14:00:00.000Z' };
    expect(deliverySentence(slot as never, 'en-IE', en.t)).toMatch(/^Arrives Mon.*14:00–15:00$/);
    expect(deliverySentence(slot as never, 'de-DE', de.t)).toMatch(/^Lieferung Mo.*14:00–15:00$/);
    const express = {
      kind: 'express',
      from: '2026-11-23T13:00:00.000Z',
      to: '2026-11-23T13:30:00.000Z',
    };
    expect(deliverySentence(express as never, 'en-IE', en.t)).toBe('Express, by 14:30');
    expect(deliverySentence(null, 'en-IE', en.t)).toBeNull();
  });

  it('labels the day tabs by the shop day: Today, Tomorrow, then the date', () => {
    const now = new Date('2026-11-23T10:00:00Z');
    expect(dayTabLabel('2026-11-23', now, 'en-IE', en.t)).toBe('Today');
    expect(dayTabLabel('2026-11-24', now, 'de-DE', de.t)).toBe('Morgen');
    expect(dayTabLabel('2026-11-26', now, 'en-IE', en.t)).toMatch(/^Thu.*26.*Nov$/);
  });

  it('finds the first open slot in time order', () => {
    const data = makeSlotsData();
    expect(firstOpenSlot(data.days)?.id).toBe('33333333-3333-4333-8333-333333333333');
    expect(firstOpenSlot([])).toBeUndefined();
  });
});

describe('HoldCountdown', () => {
  it('counts down against the server clock and tells the page once when it reaches zero', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-23T10:00:00Z'));
    const onExpired = vi.fn();
    render(
      <HoldCountdown expiresAt="2026-11-23T10:14:32.000Z" offsetMs={0} onExpired={onExpired} />,
    );
    expect(screen.getByTestId('delivery-hold')).toHaveTextContent('Held for 14:32');
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByTestId('delivery-hold')).toHaveTextContent('Held for 14:30');
    expect(onExpired).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(15 * 60_000);
    });
    expect(screen.getByTestId('delivery-hold')).toHaveTextContent('Held for 00:00');
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('uses the offset when the device clock is wrong', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-23T10:00:00Z'));
    // The server is 10 minutes ahead of this device: 4 minutes left, not 14.
    render(
      <HoldCountdown
        expiresAt="2026-11-23T10:14:00.000Z"
        offsetMs={10 * 60_000}
        onExpired={() => undefined}
      />,
    );
    expect(screen.getByTestId('delivery-hold')).toHaveTextContent('Held for 04:00');
  });
});

describe('NextDelivery on the product page', () => {
  it('says when the next slot is, from the slots of the shopper store', async () => {
    renderApp('/products/rope-tug');
    const next = await screen.findByTestId('delivery-next');
    expect(next).toHaveTextContent(
      /^Next delivery: (today|tomorrow|[A-Z][a-z]{2}) .*\d\d:\d\d–\d\d:\d\d$/,
    );
  });

  it('says "Express in 30 minutes" when express is on offer', async () => {
    server.use(
      http.get(`${API}/delivery/slots`, () =>
        HttpResponse.json({ data: makeSlotsData({ express: { available: true } }) }),
      ),
    );
    renderApp('/products/rope-tug');
    expect(await screen.findByTestId('delivery-next')).toHaveTextContent('Express in 30 minutes');
  });

  it('shows nothing when the slots cannot be loaded (no guess)', async () => {
    server.use(
      http.get(`${API}/delivery/slots`, () =>
        HttpResponse.json({ error: { code: 'INTERNAL', message: 'x' } }, { status: 500 }),
      ),
    );
    renderApp('/products/rope-tug');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByTestId('delivery-next')).not.toBeInTheDocument();
  });
});

describe('held delivery in a fixture', () => {
  it('builds a 15-minute hold on a slot of the fixture list', () => {
    const held = makeHeldDelivery();
    expect(held.kind).toBe('slot');
    expect(Date.parse(held.holdExpiresAt!) - Date.now()).toBeGreaterThan(14 * 60_000);
  });
});
