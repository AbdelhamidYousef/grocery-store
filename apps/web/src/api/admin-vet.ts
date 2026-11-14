import {
  AdminVetListResponseSchema,
  AdminVetResponseSchema,
  type VetDecision,
} from '@store/shared';

import { apiFetch } from './client';

const id = encodeURIComponent;

export function fetchAdminVetApprovals(decision: VetDecision, page: number, signal?: AbortSignal) {
  return apiFetch(`/admin/vet-approvals?decision=${decision}&page=${page}`, {
    schema: AdminVetListResponseSchema,
    ...(signal && { signal }),
  });
}

export type VetAction = { action: 'approve' } | { action: 'reject'; reason: string };

export async function decideVetApproval(orderNumber: string, input: VetAction) {
  const { action, ...body } = input;
  return (
    await apiFetch(`/admin/vet-approvals/${id(orderNumber)}/${action}`, {
      method: 'POST',
      body,
      schema: AdminVetResponseSchema,
    })
  ).data;
}
