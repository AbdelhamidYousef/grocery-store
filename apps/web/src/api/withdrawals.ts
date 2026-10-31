import {
  WithdrawalResponseSchema,
  type WithdrawalBody,
  type WithdrawalReceipt,
} from '@store/shared';

import { apiFetch } from './client';

export async function submitWithdrawal(body: WithdrawalBody): Promise<WithdrawalReceipt> {
  return (
    await apiFetch('/withdrawals', { method: 'POST', body, schema: WithdrawalResponseSchema })
  ).data;
}
