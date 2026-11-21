import {
  SubstitutesResponseSchema,
  SwapAnswerResponseSchema,
  SubstitutionSettingsResponseSchema,
  type SetSubstitutionInput,
  type SubstituteOption,
  type SwapAnswer,
  type SwapDecisionInput,
  type SubstitutionSettings,
} from '@store/shared';

import { CartResponse, type WebCart } from './cart';
import { apiFetch } from './client';

export async function fetchSubstitutes(
  slug: string,
  variantId: string,
  signal?: AbortSignal,
): Promise<SubstituteOption[]> {
  return (
    await apiFetch(
      `/products/${encodeURIComponent(slug)}/substitutes?variantId=${encodeURIComponent(variantId)}`,
      { schema: SubstitutesResponseSchema, ...(signal && { signal }) },
    )
  ).data;
}

export async function setLineSubstitution(
  id: string,
  input: SetSubstitutionInput,
): Promise<WebCart> {
  return (
    await apiFetch(`/cart/items/${encodeURIComponent(id)}/substitution`, {
      method: 'PUT',
      body: input,
      schema: CartResponse,
    })
  ).data;
}

export async function setAllSubstitutions(substitution: 'best_match' | 'none'): Promise<WebCart> {
  return (
    await apiFetch('/cart/substitution', {
      method: 'PUT',
      body: { substitution },
      schema: CartResponse,
    })
  ).data;
}

export async function fetchSubstitutionSettings(
  signal?: AbortSignal,
): Promise<SubstitutionSettings> {
  return (
    await apiFetch('/account/substitution', {
      schema: SubstitutionSettingsResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}

export async function saveSubstitutionSettings(
  input: SubstitutionSettings,
): Promise<SubstitutionSettings> {
  return (
    await apiFetch('/account/substitution', {
      method: 'PUT',
      body: input,
      schema: SubstitutionSettingsResponseSchema,
    })
  ).data;
}

// The shopper's answer to one replacement: signed in as the owner, or with the token of the email link.
export async function answerSwap(
  number: string,
  itemId: string,
  input: SwapDecisionInput,
): Promise<SwapAnswer> {
  return (
    await apiFetch(`/orders/${encodeURIComponent(number)}/swaps/${encodeURIComponent(itemId)}`, {
      method: 'POST',
      body: input,
      schema: SwapAnswerResponseSchema,
    })
  ).data;
}
