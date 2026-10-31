import { eq } from 'drizzle-orm';
import { pino } from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '../../db/client.ts';
import { emailOutbox, orders, payments } from '../../db/schema/index.ts';
import { MemoryTransport, type MailTransport } from '../../lib/mailer.ts';
import { makeTestApp } from '../../test/app.ts';
import { createShippingMethods } from '../../test/factories.ts';
import { orderByNumber, placeOrder } from '../../test/orders.ts';

import { backoffMs, createOutbox, enqueueEmail, startOutboxDrainer } from './outbox.ts';

const log = pino({ level: 'silent' });
let transport: MemoryTransport;

beforeEach(async () => {
  transport = new MemoryTransport();
  await createShippingMethods();
});

// A real (pending) order to hang rows on; pending orders enqueue nothing by themselves.
async function anOrder() {
  const { number } = await placeOrder(makeTestApp());
  return orderByNumber(number);
}
const enqueue = async (
  orderId: string,
  kind: 'order_confirmation' | 'order_shipped' = 'order_confirmation',
) => db.transaction((tx) => enqueueEmail(tx, { kind, orderId, to: 'ada@pawsome.test' }));
const rows = () => db.select().from(emailOutbox);

describe('email outbox', () => {
  it('sends a queued email once and stamps it', async () => {
    const order = await anOrder();
    await enqueue(order.id);
    const outbox = createOutbox({ transport, log });
    expect(await outbox.drain()).toEqual({ sent: 1, failed: 0, skipped: 0 });
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]).toMatchObject({ to: 'ada@pawsome.test' });
    expect(transport.sent[0]?.subject).toContain(order.number);
    expect((await rows())[0]?.sentAt).toBeInstanceOf(Date);
    // Nothing left to do on the next pass.
    expect(await outbox.drain()).toEqual({ sent: 0, failed: 0, skipped: 0 });
    expect(transport.sent).toHaveLength(1);
  });

  it('queues one email per kind and order, however often the change is replayed', async () => {
    const order = await anOrder();
    await enqueue(order.id);
    await enqueue(order.id);
    await enqueue(order.id, 'order_shipped');
    expect(await rows()).toHaveLength(2);
  });

  it('leaves no row behind when the status-change transaction rolls back', async () => {
    const order = await anOrder();
    await expect(
      db.transaction(async (tx) => {
        await enqueueEmail(tx, { kind: 'order_confirmation', orderId: order.id, to: 'a@b.c' });
        throw new Error('the status change failed');
      }),
    ).rejects.toThrow('failed');
    expect(await rows()).toHaveLength(0);
  });

  it('keeps a failed email, backs off, and sends it once the server is back', async () => {
    const order = await anOrder();
    await enqueue(order.id);
    const outbox = createOutbox({ transport, log });
    transport.failNext();
    expect(await outbox.drain()).toMatchObject({ sent: 0, failed: 1 });
    const [failed] = await rows();
    expect(failed).toMatchObject({ attempts: 1, lastError: 'SMTP down', sentAt: null });
    expect(failed!.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());

    // Not due yet: another drain leaves it alone.
    expect(await outbox.drain()).toEqual({ sent: 0, failed: 0, skipped: 0 });
    // Make it due, as time passing would.
    await db.update(emailOutbox).set({ nextAttemptAt: new Date(Date.now() - 1000) });
    expect(await outbox.drain()).toMatchObject({ sent: 1 });
    expect(transport.sent).toHaveLength(1);
  });

  it('stops retrying after the attempt limit', async () => {
    const order = await anOrder();
    await enqueue(order.id);
    await db.update(emailOutbox).set({ attempts: 8 });
    expect(await createOutbox({ transport, log }).drain()).toEqual({
      sent: 0,
      failed: 0,
      skipped: 0,
    });
    expect(transport.sent).toHaveLength(0);
  });

  it('never sends the same row twice when two drains run at once', async () => {
    const order = await anOrder();
    await enqueue(order.id);
    await enqueue(order.id, 'order_shipped');
    // Two separate outboxes = two API instances: only the row lock keeps them apart.
    const a = createOutbox({ transport, log });
    const b = createOutbox({ transport, log });
    const [ra, rb] = await Promise.all([a.drain(), b.drain()]);
    expect(ra.sent + rb.sent).toBe(2);
    expect(transport.sent).toHaveLength(2);
    expect(new Set(transport.sent.map((m) => m.messageId)).size).toBe(2);
  });

  it('marks emails as skipped when no transport is configured, instead of retrying forever', async () => {
    const order = await anOrder();
    await enqueue(order.id);
    const disabled: MailTransport = { enabled: false, send: () => Promise.reject(new Error('no')) };
    expect(await createOutbox({ transport: disabled, log }).drain()).toEqual({
      sent: 0,
      failed: 0,
      skipped: 1,
    });
    expect((await rows())[0]?.lastError).toMatch(/skipped/);
  });

  it('uses a stable Message-ID per row so a crash-and-resend is recognisable', async () => {
    const order = await anOrder();
    await enqueue(order.id);
    const [row] = await rows();
    await createOutbox({ transport, log }).drain();
    expect(transport.sent[0]?.messageId).toBe(`<${row!.id}@pawsome.local>`);
  });

  it('survives an order that vanished: the row records the error and does not crash the drain', async () => {
    const order = await anOrder();
    await enqueue(order.id);
    await db.delete(payments);
    await db.delete(orders).where(eq(orders.id, order.id)); // cascades the row away
    expect(await createOutbox({ transport, log }).drain()).toEqual({
      sent: 0,
      failed: 0,
      skipped: 0,
    });
  });

  it('backs off exponentially up to an hour', () => {
    expect([1, 2, 3].map(backoffMs)).toEqual([60_000, 120_000, 240_000]);
    expect(backoffMs(20)).toBe(3_600_000);
  });
});

describe('outbox kick and background drainer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('kick never throws or rejects when the drain itself crashes', async () => {
    const errors: string[] = [];
    const spyLog = pino({ level: 'error' }, { write: (line: string) => void errors.push(line) });
    // A transport whose `enabled` getter throws makes drainOnce reject outside its per-row catch.
    const broken = {
      get enabled(): boolean {
        throw new Error('transport exploded');
      },
      send: () => Promise.resolve(),
    } as unknown as MailTransport;
    const order = await anOrder();
    await enqueue(order.id);
    createOutbox({ transport: broken, log: spyLog }).kick();
    await vi.waitFor(() => expect(errors.join('')).toContain('email outbox drain crashed'));
  });

  it('kicks once after the first delay, then on every interval, until stopped', () => {
    vi.useFakeTimers();
    const kicks: number[] = [];
    const outbox = { drain: () => Promise.reject(new Error('unused')), kick: () => kicks.push(1) };
    const drainer = startOutboxDrainer({ outbox, log, intervalMs: 1000 });
    vi.advanceTimersByTime(5_000);
    // 1 s interval fired 5 times, plus the one-off first kick at 5 s.
    expect(kicks).toHaveLength(6);
    drainer.stop();
    vi.advanceTimersByTime(10_000);
    expect(kicks).toHaveLength(6);
  });
});
