import type { ContactBody, ContactReceipt } from '@store/shared';

import { env } from '../../config/env.ts';
import { db } from '../../db/client.ts';
import { contactMessages } from '../../db/schema/index.ts';
import { enqueueEmail, type Outbox } from '../mail/outbox.ts';

export const contactReference = (id: string): string => `MSG-${id.slice(0, 8).toUpperCase()}`;

export async function submitContact(
  body: ContactBody,
  deps: { outbox: Outbox },
): Promise<ContactReceipt> {
  // Honeypot: a filled hidden field means a bot. Answer exactly like a success (same status, same
  // shape) so it learns nothing, and store and send nothing.
  if (body.website) return { reference: 'MSG-00000000' };

  const row = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(contactMessages)
      .values({
        name: body.name,
        email: body.email,
        topic: body.topic,
        orderNumber: body.orderNumber ?? null,
        message: body.message,
      })
      .returning();
    if (!created) throw new Error('contact insert returned no row');
    const reference = contactReference(created.id);
    const payload = {
      reference,
      name: created.name,
      email: created.email,
      topic: created.topic,
      orderNumber: created.orderNumber,
      message: created.message,
    };
    // Both emails are queued in the same transaction as the row: the customer is never told
    // "received" for a message that was not stored, and the shop is never left unaware of one that was.
    await enqueueEmail(tx, {
      kind: 'contact_ack',
      to: created.email,
      payload,
      dedupeKey: `contact_ack:${created.id}`,
    });
    await enqueueEmail(tx, {
      kind: 'contact_notify',
      to: env.SHOP_INBOX_EMAIL,
      payload,
      dedupeKey: `contact_notify:${created.id}`,
    });
    return created;
  });
  deps.outbox.kick();
  return { reference: contactReference(row.id) };
}
