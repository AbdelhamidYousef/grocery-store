import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  fetchReviews,
  submitReview,
  toggleHelpful,
  type ReviewListParams,
} from '../../api/reviews';
import { keys } from '../../lib/query-client';
import { track } from '../../lib/track';

export function useReviews(slug: string, params: ReviewListParams) {
  return useQuery({
    queryKey: keys.reviews.list(slug, params),
    queryFn: ({ signal }) => fetchReviews(slug, params, signal),
    // The list differs per viewer (has THIS user voted?), so it is always asked fresh on mount.
    staleTime: 0,
  });
}

export function useSubmitReview(slug: string, productId: string) {
  return useMutation({
    mutationFn: (form: FormData) => submitReview(slug, form),
    onSuccess: (_created, form) => {
      track({
        name: 'review_submitted',
        productId,
        rating: Number(form.get('rating')),
        photos: form.getAll('photos').length,
      });
      // Nothing to refetch: a new review is pending, and the public list shows approved ones only.
    },
  });
}

export function useHelpful() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reviewId: string) => toggleHelpful(reviewId),
    onSuccess: (result, reviewId) => {
      track({ name: 'review_helpful', reviewId, voted: result.voted });
      void queryClient.invalidateQueries({ queryKey: keys.reviews.all });
    },
  });
}
