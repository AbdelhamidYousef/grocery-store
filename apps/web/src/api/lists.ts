import {
  ListDetailResponseSchema,
  ListsResponseSchema,
  ListToCartResponseSchema,
  type ListDetail,
  type ListSummary,
  type PutListItemInput,
  type ReorderResult,
} from '@store/shared';
import { z } from 'zod';

import { apiFetch } from './client';

const Summary = z.object({
  data: z.object({
    id: z.string(),
    name: z.string(),
    isDefault: z.boolean(),
    itemCount: z.number().int(),
  }),
});

export async function fetchLists(signal?: AbortSignal): Promise<ListSummary[]> {
  return (await apiFetch('/me/lists', { schema: ListsResponseSchema, ...(signal && { signal }) }))
    .data;
}

export async function fetchList(id: string, signal?: AbortSignal): Promise<ListDetail> {
  return (
    await apiFetch(`/me/lists/${encodeURIComponent(id)}`, {
      schema: ListDetailResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}

export async function createList(name: string): Promise<ListSummary> {
  return (await apiFetch('/me/lists', { method: 'POST', body: { name }, schema: Summary })).data;
}

export async function renameList(id: string, name: string): Promise<ListSummary> {
  return (
    await apiFetch(`/me/lists/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: { name },
      schema: Summary,
    })
  ).data;
}

export async function deleteList(id: string): Promise<void> {
  await apiFetch(`/me/lists/${encodeURIComponent(id)}`, { method: 'DELETE', schema: z.null() });
}

export async function putListItem(id: string, body: PutListItemInput): Promise<ListDetail> {
  return (
    await apiFetch(`/me/lists/${encodeURIComponent(id)}/items`, {
      method: 'PUT',
      body,
      schema: ListDetailResponseSchema,
    })
  ).data;
}

export async function setListItemQuantity(
  id: string,
  itemId: string,
  quantity: number,
): Promise<ListDetail> {
  return (
    await apiFetch(`/me/lists/${encodeURIComponent(id)}/items/${encodeURIComponent(itemId)}`, {
      method: 'PATCH',
      body: { quantity },
      schema: ListDetailResponseSchema,
    })
  ).data;
}

export async function removeListItem(id: string, itemId: string): Promise<ListDetail> {
  return (
    await apiFetch(`/me/lists/${encodeURIComponent(id)}/items/${encodeURIComponent(itemId)}`, {
      method: 'DELETE',
      schema: ListDetailResponseSchema,
    })
  ).data;
}

export async function addListToCart(id: string): Promise<ReorderResult> {
  return (
    await apiFetch(`/me/lists/${encodeURIComponent(id)}/add-to-cart`, {
      method: 'POST',
      schema: ListToCartResponseSchema,
    })
  ).data;
}
