import { ContactResponseSchema, type ContactBody, type ContactReceipt } from '@store/shared';

import { apiFetch } from './client';

export async function sendContactMessage(body: ContactBody): Promise<ContactReceipt> {
  return (await apiFetch('/contact', { method: 'POST', body, schema: ContactResponseSchema })).data;
}
