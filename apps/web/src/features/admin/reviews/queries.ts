import type { ReviewStatus } from '@store/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  approveAdminReview,
  deleteAdminReview,
  fetchAdminReviews,
  rejectAdminReview,
} from '../../../api/admin-reviews';
import { keys } from '../../../lib/query-client';

export function useAdminReviews(status: ReviewStatus, page: number) {
  return useQuery({
    queryKey: [...keys.admin.reviews(status), page],
    queryFn: ({ signal }) => fetchAdminReviews(status, page, signal),
    staleTime: 0,
  });
}

// A moderation action moves a review between the three queues and changes a product's rating, so
// every queue and the storefront's cached reviews and products are refreshed.
function useRefreshAfter() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'reviews'] }),
      queryClient.invalidateQueries({ queryKey: keys.reviews.all }),
      queryClient.invalidateQueries({ queryKey: keys.products.all }),
    ]);
}

export const useApproveReview = () => {
  const refresh = useRefreshAfter();
  return useMutation({ mutationFn: approveAdminReview, onSuccess: refresh });
};

export const useRejectReview = () => {
  const refresh = useRefreshAfter();
  return useMutation({
    mutationFn: (v: { id: string; reason: string }) => rejectAdminReview(v.id, v.reason),
    onSuccess: refresh,
  });
};

export const useDeleteReview = () => {
  const refresh = useRefreshAfter();
  return useMutation({ mutationFn: deleteAdminReview, onSuccess: refresh });
};
