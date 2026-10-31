import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  deleteAdminGuide,
  deleteAdminHelp,
  deleteAdminSafetyNotice,
  deleteAdminTestimonial,
  fetchAdminContactMessages,
  fetchAdminGuide,
  fetchAdminGuides,
  fetchAdminHelp,
  fetchAdminHomeContent,
  fetchAdminSafetyNotice,
  fetchAdminSafetyNotices,
  fetchAdminTestimonials,
  fetchAdminWithdrawals,
  notifyAdminSafetyNotice,
  putAdminHomeContent,
  saveAdminGuide,
  saveAdminHelp,
  saveAdminSafetyNotice,
  saveAdminTestimonial,
  setAdminContactHandled,
  setAdminWithdrawalStatus,
} from '../../../api/admin-content';
import { keys } from '../../../lib/query-client';

// Like the other admin queries: never "fresh", so a revisited screen shows the cached copy at once
// and refetches behind it.
const FRESH = 0;

// A write to content changes what the public sees, so the matching storefront caches are marked
// stale too (they refetch next time someone looks).
function useInvalidate(...families: (readonly unknown[])[]) {
  const queryClient = useQueryClient();
  return () => Promise.all(families.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

export const useAdminGuides = () =>
  useQuery({
    queryKey: keys.admin.content.guides,
    queryFn: ({ signal }) => fetchAdminGuides(signal),
    staleTime: FRESH,
  });
export const useAdminGuide = (id: string | undefined) =>
  useQuery({
    queryKey: keys.admin.content.guide(id ?? ''),
    queryFn: ({ signal }) => fetchAdminGuide(id ?? '', signal),
    enabled: !!id,
    staleTime: FRESH,
  });
export function useSaveGuide(id: string | null) {
  const refresh = useInvalidate(keys.admin.content.guides, keys.guides.all);
  return useMutation({
    mutationFn: (input: Parameters<typeof saveAdminGuide>[1]) => saveAdminGuide(id, input),
    onSuccess: refresh,
  });
}
export function useDeleteGuide() {
  const refresh = useInvalidate(keys.admin.content.guides, keys.guides.all);
  return useMutation({ mutationFn: deleteAdminGuide, onSuccess: refresh });
}

export const useAdminHelp = () =>
  useQuery({
    queryKey: keys.admin.content.help,
    queryFn: ({ signal }) => fetchAdminHelp(signal),
    staleTime: FRESH,
  });
export function useSaveHelp(id: string | null) {
  const refresh = useInvalidate(keys.admin.content.help, keys.help.all);
  return useMutation({
    mutationFn: (input: Parameters<typeof saveAdminHelp>[1]) => saveAdminHelp(id, input),
    onSuccess: refresh,
  });
}
export function useDeleteHelp() {
  const refresh = useInvalidate(keys.admin.content.help, keys.help.all);
  return useMutation({ mutationFn: deleteAdminHelp, onSuccess: refresh });
}

export const useAdminTestimonials = () =>
  useQuery({
    queryKey: keys.admin.content.testimonials,
    queryFn: ({ signal }) => fetchAdminTestimonials(signal),
    staleTime: FRESH,
  });
export function useSaveTestimonial(id: string | null) {
  const refresh = useInvalidate(keys.admin.content.testimonials);
  return useMutation({
    mutationFn: (input: Parameters<typeof saveAdminTestimonial>[1]) =>
      saveAdminTestimonial(id, input),
    onSuccess: refresh,
  });
}
export function useDeleteTestimonial() {
  const refresh = useInvalidate(keys.admin.content.testimonials);
  return useMutation({ mutationFn: deleteAdminTestimonial, onSuccess: refresh });
}

export const useAdminSafetyNotices = () =>
  useQuery({
    queryKey: keys.admin.content.safety,
    queryFn: ({ signal }) => fetchAdminSafetyNotices(signal),
    staleTime: FRESH,
  });
export const useAdminSafetyNotice = (id: string | undefined) =>
  useQuery({
    queryKey: keys.admin.content.safetyNotice(id ?? ''),
    queryFn: ({ signal }) => fetchAdminSafetyNotice(id ?? '', signal),
    enabled: !!id,
    staleTime: FRESH,
  });
export function useSaveSafetyNotice(id: string | null) {
  const refresh = useInvalidate(keys.admin.content.safety, keys.safety.active, keys.products.all);
  return useMutation({
    mutationFn: (input: Parameters<typeof saveAdminSafetyNotice>[1]) =>
      saveAdminSafetyNotice(id, input),
    onSuccess: refresh,
  });
}
export function useDeleteSafetyNotice() {
  const refresh = useInvalidate(keys.admin.content.safety, keys.safety.active, keys.products.all);
  return useMutation({ mutationFn: deleteAdminSafetyNotice, onSuccess: refresh });
}
export function useNotifySafetyNotice(id: string) {
  const refresh = useInvalidate(keys.admin.content.safety);
  return useMutation({ mutationFn: () => notifyAdminSafetyNotice(id), onSuccess: refresh });
}

export const useAdminWithdrawals = () =>
  useQuery({
    queryKey: keys.admin.content.withdrawals,
    queryFn: ({ signal }) => fetchAdminWithdrawals(signal),
    staleTime: FRESH,
  });
export function useSetWithdrawalStatus() {
  const refresh = useInvalidate(keys.admin.content.withdrawals);
  return useMutation({
    mutationFn: (v: { id: string; status: Parameters<typeof setAdminWithdrawalStatus>[1] }) =>
      setAdminWithdrawalStatus(v.id, v.status),
    onSuccess: refresh,
  });
}

export const useAdminMessages = () =>
  useQuery({
    queryKey: keys.admin.content.messages,
    queryFn: ({ signal }) => fetchAdminContactMessages(signal),
    staleTime: FRESH,
  });
export function useSetContactHandled() {
  const refresh = useInvalidate(keys.admin.content.messages);
  return useMutation({
    mutationFn: (v: { id: string; handled: boolean }) => setAdminContactHandled(v.id, v.handled),
    onSuccess: refresh,
  });
}

export const useAdminHomeContent = () =>
  useQuery({
    queryKey: keys.admin.content.home,
    queryFn: ({ signal }) => fetchAdminHomeContent(signal),
    staleTime: FRESH,
  });
export function useSaveHomeContent() {
  const refresh = useInvalidate(keys.admin.content.home);
  return useMutation({
    mutationFn: (v: { key: Parameters<typeof putAdminHomeContent>[0]; value: unknown }) =>
      putAdminHomeContent(v.key, v.value),
    onSuccess: refresh,
  });
}
