import {
  NewsletterConfirmResponseSchema,
  NewsletterSubscribeResponseSchema,
  NewsletterUnsubscribeResponseSchema,
  type NewsletterSubscribeInput,
} from '@store/shared';

import { apiFetch } from './client';

export async function subscribeNewsletter(body: NewsletterSubscribeInput): Promise<void> {
  await apiFetch('/newsletter/subscribe', {
    method: 'POST',
    body,
    schema: NewsletterSubscribeResponseSchema,
  });
}

export async function confirmNewsletter(token: string): Promise<'confirmed' | 'already_confirmed'> {
  return (
    await apiFetch('/newsletter/confirm', {
      method: 'POST',
      body: { token },
      schema: NewsletterConfirmResponseSchema,
    })
  ).data.status;
}

export async function unsubscribeNewsletter(token: string): Promise<void> {
  await apiFetch('/newsletter/unsubscribe', {
    method: 'POST',
    body: { token },
    schema: NewsletterUnsubscribeResponseSchema,
  });
}
