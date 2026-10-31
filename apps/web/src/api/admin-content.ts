import {
  AdminContactListResponseSchema,
  AdminContactResponseSchema,
  AdminGuideListResponseSchema,
  AdminGuideResponseSchema,
  AdminHelpListResponseSchema,
  AdminHelpResponseSchema,
  AdminHomeContentResponseSchema,
  AdminSafetyListResponseSchema,
  AdminSafetyNotifyResponseSchema,
  AdminSafetyResponseSchema,
  AdminTestimonialListResponseSchema,
  AdminTestimonialResponseSchema,
  AdminWithdrawalListResponseSchema,
  AdminWithdrawalResponseSchema,
  type AdminContactMessage,
  type AdminGuide,
  type AdminGuideInput,
  type AdminGuideRow,
  type AdminHelpArticle,
  type AdminHelpInput,
  type AdminHomeContent,
  type AdminSafetyInput,
  type AdminSafetyNotice,
  type AdminSafetyNotifyResult,
  type AdminTestimonial,
  type AdminTestimonialInput,
  type AdminWithdrawal,
  type HomeContentKey,
  type WithdrawalStatus,
} from '@store/shared';

import { NoContentSchema } from './auth';
import { apiFetch } from './client';

// Back-office content calls. Same rules as api/admin.ts: one apiFetch, shared Zod schemas, and the
// API answers 401/403 to anyone who is not an admin.

const path = (base: string, id: string) => `${base}/${encodeURIComponent(id)}`;

// ---------- guides ----------
export async function fetchAdminGuides(signal?: AbortSignal): Promise<AdminGuideRow[]> {
  return (
    await apiFetch('/admin/guides', {
      schema: AdminGuideListResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}
export async function fetchAdminGuide(id: string, signal?: AbortSignal): Promise<AdminGuide> {
  return (
    await apiFetch(path('/admin/guides', id), {
      schema: AdminGuideResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}
export async function saveAdminGuide(
  id: string | null,
  input: AdminGuideInput,
): Promise<AdminGuide> {
  return (
    await apiFetch(id ? path('/admin/guides', id) : '/admin/guides', {
      method: id ? 'PUT' : 'POST',
      body: input,
      schema: AdminGuideResponseSchema,
    })
  ).data;
}
export async function deleteAdminGuide(id: string): Promise<void> {
  await apiFetch(path('/admin/guides', id), { method: 'DELETE', schema: NoContentSchema });
}

// ---------- help articles ----------
export async function fetchAdminHelp(signal?: AbortSignal): Promise<AdminHelpArticle[]> {
  return (
    await apiFetch('/admin/help-articles', {
      schema: AdminHelpListResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}
export async function saveAdminHelp(
  id: string | null,
  input: AdminHelpInput,
): Promise<AdminHelpArticle> {
  return (
    await apiFetch(id ? path('/admin/help-articles', id) : '/admin/help-articles', {
      method: id ? 'PUT' : 'POST',
      body: input,
      schema: AdminHelpResponseSchema,
    })
  ).data;
}
export async function deleteAdminHelp(id: string): Promise<void> {
  await apiFetch(path('/admin/help-articles', id), { method: 'DELETE', schema: NoContentSchema });
}

// ---------- testimonials ----------
export async function fetchAdminTestimonials(signal?: AbortSignal): Promise<AdminTestimonial[]> {
  return (
    await apiFetch('/admin/testimonials', {
      schema: AdminTestimonialListResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}
export async function saveAdminTestimonial(
  id: string | null,
  input: AdminTestimonialInput,
): Promise<AdminTestimonial> {
  return (
    await apiFetch(id ? path('/admin/testimonials', id) : '/admin/testimonials', {
      method: id ? 'PUT' : 'POST',
      body: input,
      schema: AdminTestimonialResponseSchema,
    })
  ).data;
}
export async function deleteAdminTestimonial(id: string): Promise<void> {
  await apiFetch(path('/admin/testimonials', id), { method: 'DELETE', schema: NoContentSchema });
}

// ---------- safety notices ----------
export async function fetchAdminSafetyNotices(signal?: AbortSignal): Promise<AdminSafetyNotice[]> {
  return (
    await apiFetch('/admin/safety-notices', {
      schema: AdminSafetyListResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}
export async function fetchAdminSafetyNotice(
  id: string,
  signal?: AbortSignal,
): Promise<AdminSafetyNotice> {
  return (
    await apiFetch(path('/admin/safety-notices', id), {
      schema: AdminSafetyResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}
export async function saveAdminSafetyNotice(
  id: string | null,
  input: AdminSafetyInput,
): Promise<AdminSafetyNotice> {
  return (
    await apiFetch(id ? path('/admin/safety-notices', id) : '/admin/safety-notices', {
      method: id ? 'PUT' : 'POST',
      body: input,
      schema: AdminSafetyResponseSchema,
    })
  ).data;
}
export async function deleteAdminSafetyNotice(id: string): Promise<void> {
  await apiFetch(path('/admin/safety-notices', id), { method: 'DELETE', schema: NoContentSchema });
}
export async function notifyAdminSafetyNotice(id: string): Promise<AdminSafetyNotifyResult> {
  return (
    await apiFetch(`${path('/admin/safety-notices', id)}/notify`, {
      method: 'POST',
      body: {},
      schema: AdminSafetyNotifyResponseSchema,
    })
  ).data;
}

// ---------- withdrawals and messages ----------
export async function fetchAdminWithdrawals(signal?: AbortSignal): Promise<AdminWithdrawal[]> {
  return (
    await apiFetch('/admin/withdrawals', {
      schema: AdminWithdrawalListResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}
export async function setAdminWithdrawalStatus(
  id: string,
  status: WithdrawalStatus,
): Promise<AdminWithdrawal> {
  return (
    await apiFetch(path('/admin/withdrawals', id), {
      method: 'PATCH',
      body: { status },
      schema: AdminWithdrawalResponseSchema,
    })
  ).data;
}
export async function fetchAdminContactMessages(
  signal?: AbortSignal,
): Promise<AdminContactMessage[]> {
  return (
    await apiFetch('/admin/contact-messages', {
      schema: AdminContactListResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}
export async function setAdminContactHandled(
  id: string,
  handled: boolean,
): Promise<AdminContactMessage> {
  return (
    await apiFetch(path('/admin/contact-messages', id), {
      method: 'PATCH',
      body: { handled },
      schema: AdminContactResponseSchema,
    })
  ).data;
}

// ---------- homepage blocks ----------
export async function fetchAdminHomeContent(signal?: AbortSignal): Promise<AdminHomeContent> {
  return (
    await apiFetch('/admin/home-content', {
      schema: AdminHomeContentResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}
export async function putAdminHomeContent(
  key: HomeContentKey,
  value: unknown,
): Promise<AdminHomeContent> {
  return (
    await apiFetch(`/admin/home-content/${key}`, {
      method: 'PUT',
      body: { value },
      schema: AdminHomeContentResponseSchema,
    })
  ).data;
}
