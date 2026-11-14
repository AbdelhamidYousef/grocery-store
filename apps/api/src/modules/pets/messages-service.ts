import {
  BIRTHDAY_CODE_DAYS,
  BIRTHDAY_CODE_PERCENT,
  isBirthdayToday,
  PET_MILESTONES,
  lifeStagesDue,
  PET_CATEGORY_SLUGS,
  YOUNG_SPECIES,
} from '@store/shared';
import { and, eq, isNotNull } from 'drizzle-orm';
import type { Logger } from 'pino';

import { env } from '../../config/env.ts';
import { db, type Tx } from '../../db/client.ts';
import { newsletterSubscribers, petMessages, pets, users } from '../../db/schema/index.ts';
import { storeFor } from '../../emails/i18n/index.ts';
import { mintPersonalCode } from '../loyalty/codes.ts';
import { enqueueEmail, type Outbox } from '../mail/outbox.ts';
import { unsubscribeUrl } from '../newsletter/service.ts';

const origin = (): string => env.WEB_ORIGIN.replace(/\/$/, '');

export interface PetMessageResult {
  birthdays: number;
  lifeStages: number;
}

// Claims "this pet, this mail, this period" by inserting the unique row. Whoever inserts it owns
// the send; a second run (or a second job process) gets nothing back and skips. The claim, the
// minted code and the queued email commit together, so a crash cannot leave a code with no mail.
async function claim(tx: Tx, petId: string, kind: string, periodKey: string): Promise<boolean> {
  const rows = await tx
    .insert(petMessages)
    .values({ petId, kind, periodKey })
    .onConflictDoNothing()
    .returning({ id: petMessages.id });
  return rows.length > 0;
}

// Daily job. Only people with a CONFIRMED newsletter subscription are mailed (these are marketing
// emails: consent first), found by the account's email. A pet without a birth date is skipped.
// "Today" is the UTC date of the job's clock; a birthday has no time zone.
export async function sendPetMessages(deps: {
  now: Date;
  outbox?: Outbox | undefined;
  log: Logger;
}): Promise<PetMessageResult> {
  const today = deps.now.toISOString().slice(0, 10);
  const year = today.slice(0, 4);
  const result: PetMessageResult = { birthdays: 0, lifeStages: 0 };

  const candidates = await db
    .select({
      petId: pets.id,
      petName: pets.name,
      species: pets.species,
      birthday: pets.birthday,
      userId: pets.userId,
      email: users.email,
      unsubscribeToken: newsletterSubscribers.unsubscribeToken,
      storeView: newsletterSubscribers.storeView,
    })
    .from(pets)
    .innerJoin(users, eq(users.id, pets.userId))
    .innerJoin(
      newsletterSubscribers,
      and(
        eq(newsletterSubscribers.email, users.email),
        eq(newsletterSubscribers.status, 'confirmed'),
      ),
    )
    .where(isNotNull(pets.birthday));

  for (const c of candidates) {
    if (!c.birthday) continue;
    const unsub = unsubscribeUrl(c.unsubscribeToken);
    try {
      await db.transaction(async (tx) => {
        if (isBirthdayToday(c.birthday!, today) && (await claim(tx, c.petId, 'birthday', year))) {
          const code = await mintPersonalCode(tx, {
            userId: c.userId,
            kind: 'percent',
            valueCents: BIRTHDAY_CODE_PERCENT,
            expiresInDays: BIRTHDAY_CODE_DAYS,
            prefix: 'BDAY',
            groups: 1,
            now: deps.now,
          });
          await enqueueEmail(tx, {
            kind: 'pet_birthday',
            to: c.email,
            storeView: c.storeView,
            dedupeKey: `pet_birthday:${c.petId}:${year}`,
            payload: {
              petName: c.petName,
              code: code.code,
              percent: BIRTHDAY_CODE_PERCENT,
              days: BIRTHDAY_CODE_DAYS,
              shopUrl: `${origin()}/${storeFor(c.storeView).code}/c/${PET_CATEGORY_SLUGS[c.species]}`,
              unsubscribeUrl: unsub,
            },
          });
          result.birthdays += 1;
        }
        const species = YOUNG_SPECIES.find((s) => s === c.species);
        if (!species) return;
        for (const kind of lifeStagesDue(c.birthday!, today)) {
          if (!(await claim(tx, c.petId, kind, 'once'))) continue;
          const stage = PET_MILESTONES.find((s) => s.kind === kind)!;
          await enqueueEmail(tx, {
            kind: 'pet_life_stage',
            to: c.email,
            storeView: c.storeView,
            dedupeKey: `pet_life_stage:${c.petId}:${kind}`,
            payload: {
              petName: c.petName,
              species,
              ageLabel: stage.label,
              milestone: kind,
              categoryUrl: `${origin()}/${storeFor(c.storeView).code}/c/${PET_CATEGORY_SLUGS[c.species]}`,
              unsubscribeUrl: unsub,
            },
          });
          result.lifeStages += 1;
        }
      });
    } catch (err) {
      // One pet's failure must not stop everyone else's mail; the claim rolled back with it, so
      // the next run retries this pet.
      deps.log.error({ err, petId: c.petId }, 'pet message failed');
    }
  }
  if (result.birthdays + result.lifeStages > 0) deps.outbox?.kick();
  return result;
}
