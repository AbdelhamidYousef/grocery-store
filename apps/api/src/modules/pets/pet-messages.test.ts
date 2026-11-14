import { eq } from 'drizzle-orm';
import { pino } from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { discountCodes, newsletterSubscribers, petMessages, pets } from '../../db/schema/index.ts';
import { runJob } from '../../jobs/runner.ts';
import { MemoryTransport } from '../../lib/mailer.ts';
import { createUser } from '../../test/factories.ts';
import { FakeStripe } from '../../test/fake-stripe.ts';
import { createOutbox } from '../mail/outbox.ts';

import { sendPetMessages } from './messages-service.ts';

let transport: MemoryTransport;
let outbox: ReturnType<typeof createOutbox>;
const log = pino({ level: 'silent' });
beforeEach(() => {
  transport = new MemoryTransport();
  outbox = createOutbox({ transport, log });
});

async function owner(opts: { subscribed?: boolean } = {}) {
  const user = await createUser();
  if (opts.subscribed ?? true) {
    await db.insert(newsletterSubscribers).values({
      email: user.email,
      status: 'confirmed',
      confirmedAt: new Date(),
      unsubscribeToken: `unsub-${user.id}`,
      consentText: 'test',
    });
  }
  return user;
}
const addPet = (
  userId: string,
  p: { name?: string; species?: 'dog' | 'cat' | 'bird'; birthday: string | null },
) =>
  db
    .insert(pets)
    .values({ userId, name: p.name ?? 'Rex', species: p.species ?? 'dog', birthday: p.birthday })
    .returning()
    .then((r) => r[0]!);
const run = (iso: string) => sendPetMessages({ now: new Date(iso), outbox, log });
const mails = async () => {
  await outbox.drain();
  return transport.sent;
};

describe('birthdays', () => {
  it('mints a 10% personal code valid 14 days and mails it, once per year', async () => {
    const u = await owner();
    const pet = await addPet(u.id, { name: 'Rex', birthday: '2022-03-18' });
    expect(await run('2026-03-18T08:00:00Z')).toEqual({ birthdays: 1, lifeStages: 0 });
    const [code] = await db.select().from(discountCodes);
    expect(code).toMatchObject({ kind: 'percent', value: 10, maxUses: 1, ownerUserId: u.id });
    expect(Math.round((code!.endsAt!.getTime() - code!.startsAt!.getTime()) / 86_400_000)).toBe(14);
    const sent = await mails();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toBe('Happy birthday, Rex!');
    expect(sent[0]!.text).toContain(code!.code);
    expect(sent[0]!.text).toMatch(/newsletter\/unsubscribe\?token=unsub-/);

    // a second run the same day, or later that day, sends nothing
    expect(await run('2026-03-18T20:00:00Z')).toEqual({ birthdays: 0, lifeStages: 0 });
    expect(await db.select().from(discountCodes)).toHaveLength(1);
    // next year it is a new period
    expect(await run('2027-03-18T08:00:00Z')).toEqual({ birthdays: 1, lifeStages: 0 });
    const rows = await db.select().from(petMessages).where(eq(petMessages.petId, pet.id));
    expect(rows.map((r) => r.periodKey).sort()).toEqual(['2026', '2027']);
  });

  it('treats a 29 Feb birthday as 28 Feb in common years, 29 Feb in leap years', async () => {
    const u = await owner();
    await addPet(u.id, { birthday: '2020-02-29' });
    expect(await run('2027-02-28T08:00:00Z')).toMatchObject({ birthdays: 1 });
    expect(await run('2027-03-01T08:00:00Z')).toMatchObject({ birthdays: 0 });
    expect(await run('2028-02-28T08:00:00Z')).toMatchObject({ birthdays: 0 });
    expect(await run('2028-02-29T08:00:00Z')).toMatchObject({ birthdays: 1 });
  });

  it('skips a pet without a birth date and an owner without confirmed consent', async () => {
    const withoutDate = await owner();
    await addPet(withoutDate.id, { birthday: null });
    const noConsent = await owner({ subscribed: false });
    await addPet(noConsent.id, { birthday: '2022-03-18' });
    const pending = await createUser();
    await db.insert(newsletterSubscribers).values({
      email: pending.email,
      status: 'pending',
      unsubscribeToken: 'u-pending',
      consentText: 'test',
    });
    await addPet(pending.id, { birthday: '2022-03-18' });
    const unsubscribed = await owner();
    await db
      .update(newsletterSubscribers)
      .set({ status: 'unsubscribed' })
      .where(eq(newsletterSubscribers.email, unsubscribed.email));
    await addPet(unsubscribed.id, { birthday: '2022-03-18' });

    expect(await run('2026-03-18T08:00:00Z')).toEqual({ birthdays: 0, lifeStages: 0 });
    expect(await db.select().from(discountCodes)).toHaveLength(0);
    expect(await mails()).toHaveLength(0);
  });
});

describe('life stages', () => {
  it('mails puppies and kittens at 8 weeks, 6 months and 12 months, linking to the category', async () => {
    const u = await owner();
    await addPet(u.id, { name: 'Pip', species: 'dog', birthday: '2026-09-01' });
    await addPet(u.id, { name: 'Mia', species: 'cat', birthday: '2026-09-01' });
    await addPet(u.id, { name: 'Tweet', species: 'bird', birthday: '2026-09-01' });
    expect(await run('2026-10-27T08:00:00Z')).toEqual({ birthdays: 0, lifeStages: 2 });
    const sent = await mails();
    expect(sent.map((m) => m.subject).sort()).toEqual([
      'Mia is 8 weeks old: time to look at food?',
      'Pip is 8 weeks old: time to look at food?',
    ]);
    expect(sent.find((m) => m.subject.startsWith('Pip'))!.text).toMatch(/\/c\/dogs/);
    expect(sent.find((m) => m.subject.startsWith('Mia'))!.text).toMatch(/\/c\/cats/);
    // the next day: nothing again; 6 months later: the next milestone
    expect(await run('2026-10-28T08:00:00Z')).toEqual({ birthdays: 0, lifeStages: 0 });
    expect(await run('2027-03-01T08:00:00Z')).toEqual({ birthdays: 0, lifeStages: 2 });
  });
});

describe('the pet-messages job', () => {
  it('is registered daily and a second run in the same day sends nothing', async () => {
    const u = await owner();
    await addPet(u.id, { birthday: '2022-03-18' });
    const ctx = { now: new Date('2026-03-18T07:00:00Z'), log, gateway: new FakeStripe(), outbox };
    expect((await runJob('pet-messages', ctx)).status).toBe('ran');
    expect((await runJob('pet-messages', ctx)).status).toBe('skipped');
    expect(await mails()).toHaveLength(1);
  });
});
